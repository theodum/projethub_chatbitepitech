# 🏗️ Architecture technique — Epibot

## Vue d'ensemble

Application 3 tiers :

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│  Frontend        │      │  Backend          │      │  Supabase            │
│  React + Vite    │◄────►│  FastAPI (Python) │◄────►│  PostgreSQL 17       │
│  (:5173)         │ HTTP │  (:3001)          │      │  + pgvector + Auth   │
└─────────────────┘      └──────────────────┘      └─────────────────────┘
        │                         │                          ▲
        │  Auth + CRUD direct     │  RAG + génération        │
        │  (clé anon, RLS)        │  (clé service_role)      │
        └─────────────────────────┴──────────────────────────┘
                                  │
                                  ▼
                        ┌───────────────────┐
                        │  Google Gemini     │
                        │  chat + embeddings │
                        └───────────────────┘
```

- Le **frontend** parle directement à Supabase pour l'**auth** et les opérations CRUD (messages, conversations, users) — soumis au **RLS**.
- Le **backend** gère la partie **IA** (RAG + génération) et l'**ingestion** ; il utilise la clé `service_role` (contourne le RLS car c'est un serveur de confiance).
- En dev, Vite **proxifie** `/api/*` vers le backend (voir `vite.config.ts`).

---

## 🔄 Flux de données

### 1. Poser une question (retrieval + génération)

```
Étudiant tape une question
   │
   ▼
Frontend : sauvegarde la question (Supabase) + POST /api/chat/stream
   │
   ▼
Backend  : retrieve_context()
   │  ① embedding de la question (gemini-embedding-001, RETRIEVAL_QUERY)
   │  ② RPC match_document_chunks(embedding, seuil=0.65, k=5)  → top-k passages
   │  ③ injection des passages dans le system prompt
   ▼
Backend  : génération streamée (gemini-2.5-flash) → flux ndjson
   │  ligne 1 : meta   {sources, max_similarity, context_found, flagged}
   │  lignes  : delta  {text}   (mot à mot)
   │  fin     : done
   ▼
Frontend : affiche le texte au fil de l'eau, puis les sources 📎,
           sauvegarde la réponse + métadonnées, et le flag de modération
```

### 2. Ingérer un document (offline ou via l'admin)

```
PDF / .txt / .md
   │  extraction du texte (pypdf pour les PDF)
   ▼
découpage en chunks (~1500 caractères, 200 de recouvrement)
   │  embedding de chaque chunk (gemini-embedding-001, RETRIEVAL_DOCUMENT)
   ▼
insertion : documents (1 ligne/fichier) + document_chunks (1 ligne/chunk + vecteur)
```

Deux points d'entrée, **même logique** (`services/ingestion_service.py`) :
- **CLI** : `python ingest.py` (parcourt `backend/documents/`)
- **API** : `POST /api/admin/documents` (upload depuis l'onglet Docs)

L'ingestion est **idempotente** : réimporter un fichier de même nom remplace proprement l'ancienne version.

---

## 🗄️ Base de données

### Tables (`public`)

| Table | Colonnes clés | Rôle |
|-------|---------------|------|
| `users` | `id` (= `auth.users.id`), `email`, `name`, `role` (`user`/`admin`), `promo`, `avatar_url` | Profils |
| `conversations` | `id`, `user_id`, `title`, `created_at` | Fils de discussion |
| `messages` | `id`, `conversation_id`, `user_id` (**null = bot**), `content`, `created_at`, `feedback`, `rag_similarity`, `rag_sources`, `rag_context_found`, `flagged` | Messages + signaux |
| `admin_notifications` | `id`, `user_id`, `alert_date`, `type`, `message` | Alertes d'usage |
| `documents` | `id`, `titre`, `source`, `created_at` | Documents sources (RAG) |
| `document_chunks` | `id`, `document_id`, `contenu`, `embedding vector(768)` | Passages vectorisés (index **HNSW**) |

### Schéma `private` (non exposé par l'API)
- `is_admin()` — helper `SECURITY DEFINER` utilisé par les policies RLS (évite la récursion).
- `handle_new_user()` — trigger sur `auth.users` : crée automatiquement le profil `public.users` à l'inscription.

### Fonction de recherche
- `public.match_document_chunks(query_embedding, match_threshold, match_count)` — `SECURITY DEFINER`, similarité cosinus (`<=>`), réservée à la clé `service_role`.

### Migrations (versionnées)
| # | Nom | Contenu |
|---|-----|---------|
| 01 | `app_schema` | tables applicatives + RLS |
| 02 | `rag` | pgvector, `documents`, `document_chunks`, `match_document_chunks` |
| 03 | `hardening` | `is_admin()` déplacée en schéma `private`, recherche réservée au backend |
| 04 | `user_trigger` | création auto des profils (`handle_new_user`) |
| 05 | `logging` | colonnes `feedback` / `rag_*` sur `messages` + policy d'update |
| 06 | `moderation_flag` | colonne `flagged` |

---

## 🔐 Modèle de sécurité

- **RLS activé** sur toutes les tables. Grandes lignes :
  - `users` : je lis/modifie mon profil ; l'admin lit tout.
  - `conversations` / `messages` : chacun les siennes ; l'admin lit tous les messages.
  - `documents` / `document_chunks` : lecture pour les utilisateurs connectés ; écriture réservée au `service_role`.
- **Backend = serveur de confiance** : clé `service_role` (bypasse le RLS) pour la recherche et l'ingestion. **Jamais** exposée au frontend.
- **Endpoints admin** (`/api/admin/*`) : protégés par vérification du **JWT Supabase** + du **rôle `admin`** en base.
- Auth restreinte à `@epitech.eu` (email/mot de passe) ; Google OAuth également disponible.

---

## 🎓 Garde-fou pédagogique & modération

Epibot doit **aider à apprendre sans faire le travail à la place de l'étudiant**. Deux couches **indépendantes** :

### 1. Prévention — le *system prompt*
Le prompt système (défaut de `ChatRequest`, dans `models/chat_models.py`) pose une **règle absolue, prioritaire sur toute autre instruction** : ne jamais fournir la solution complète ni le code d'un exercice. Il neutralise explicitement les contournements courants — autorité (« je suis prof/admin »), « juste pour vérifier », « donne juste l'**interface** / le header / un exemple à adapter », pseudo-code déguisé, autre langage, fractionnement, jeu de rôle — et bloque l'**injection de prompt** (ni les messages ni les documents ne peuvent lever la règle). Il distingue l'**autorisé** (concepts, démarche, syntaxe neutre, debug) de l'**interdit** (écrire/compléter le code, fournir un header/interface/prototypes du projet).

### 2. Détection & traçabilité — la modération serveur
`services/moderation_service.py` (`is_bypass_attempt`) applique des **motifs heuristiques** sur la question pour repérer les demandes de code / solution / artefact direct (« donne le code », « fais mon projet », « donne l'interface »…). Le résultat (`flagged`) est renvoyé dans la réponse / le flux et **persisté** sur le message (colonne `messages.flagged`), puis affiché dans l'onglet **Modération** de l'admin.

> ⚠️ Aucune de ces couches n'est infaillible (limite intrinsèque des LLM). L'objectif est de rendre le contournement **difficile** et de **tracer** les tentatives. La détection est volontairement large (elle peut sur-signaler) : c'est une **alerte à confirmer**, pas un blocage.

---

## 🌐 Référence API (backend)

Base : `http://localhost:3001`

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `POST` | `/api/chat/chat` | — | Réponse complète (non-streamée). Renvoie `{response, sources, max_similarity, context_found, flagged}` |
| `POST` | `/api/chat/stream` | — | Réponse **streamée** (ndjson : `meta` puis `delta` puis `done`/`error`) |
| `POST` | `/api/chat/upload` | — | Upload d'un fichier texte brut (utilitaire) |
| `GET` | `/api/chat/health` | — | Vérification de santé |
| `GET` | `/api/admin/documents` | admin | Liste des documents + nb de chunks |
| `POST` | `/api/admin/documents` | admin | Upload + ingestion d'un document (PDF/txt/md) |
| `DELETE`| `/api/admin/documents/{id}` | admin | Suppression d'un document (cascade sur ses chunks) |

Documentation interactive (Swagger) : `http://localhost:3001/docs`.

---

## ⚙️ Paramètres de réglage

| Paramètre | Emplacement | Défaut | Effet |
|-----------|-------------|--------|-------|
| Taille des chunks | `services/ingestion_service.py` `CHUNK_SIZE` | 1500 | + grand = + de contexte, - de précision |
| Recouvrement | `CHUNK_OVERLAP` | 200 | évite de couper une idée en deux |
| Passages injectés | `routes.py` `retrieve_context(match_count=)` | 5 | + = plus de contexte (mais + de bruit) |
| Seuil de similarité | `retrieve_context(match_threshold=)` | 0.65 | + haut = + strict (coupe le hors-sujet) |
| Modèle de chat | `services/googleai_service.py` `model_name` | `gemini-2.5-flash` | — |
| Modèle d'embeddings | `services/embeddings_service.py` `EMBEDDING_MODEL` | `gemini-embedding-001` (768d) | doit correspondre à `vector(768)` |

> **Note sur le seuil 0.65** : mesuré sur données réelles, les questions dans le corpus obtiennent ~0.70–0.78 de similarité, le hors-sujet ~0.57–0.61. Le seuil tombe donc dans l'écart. À réévaluer si le corpus change beaucoup.
