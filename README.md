# 🌽 Epibot

> Assistant conversationnel **pédagogique** pour les étudiants Epitech, basé sur un **RAG** (Retrieval-Augmented Generation) : le chatbot répond aux questions sur les projets et cours à partir de **tes propres documents**, tout en refusant de donner directement le code des exercices.

Epibot combine un chat en temps réel (réponses streamées, avec citation des sources) et un **back-office d'administration** complet pour piloter la base de connaissances, mesurer la qualité et modérer l'usage.

---

## ✨ Fonctionnalités

### Côté étudiant (chat)
- 💬 **Chat avec RAG** : les réponses s'appuient sur les documents ingérés (sujets de projets, cours…)
- ⚡ **Réponses en streaming** (mot à mot)
- 📎 **Sources affichées** sous chaque réponse (quels documents ont servi)
- 👍/👎 **Feedback** sur les réponses (persisté)
- 🗂️ **Conversations multiples** (historique par conversation)
- 🎓 **Garde-fou pédagogique** : le bot explique et oriente, mais ne livre jamais le code tout fait

### Côté administrateur (6 onglets)
| Onglet | Rôle |
|--------|------|
| **Accueil** | Vue d'ensemble + alertes d'usage |
| **Étudiants** | Historique complet des conversations, score d'usage par étudiant |
| **Stats** | Documents les plus consultés, répartition par promo, activité (7 jours) |
| **Qualité** | Taux de satisfaction, réponses 👎, **trous de connaissance** |
| **Docs** | Upload / liste / suppression de la base de connaissances (RAG) |
| **Modération** | Détection des tentatives de contournement + surveillance de l'usage |

---

## 🧱 Stack technique

| Couche | Technologies |
|--------|--------------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, lucide-react, react-markdown |
| **Backend** | Python, FastAPI, Uvicorn, Pydantic |
| **Base de données** | Supabase (PostgreSQL 17 + **pgvector** + Auth), RLS activé |
| **IA** | Google Gemini — `gemini-2.5-flash` (chat) et `gemini-embedding-001` (embeddings, 768 dim) |
| **Ingestion** | pypdf (extraction PDF) |

---

## 🚀 Démarrage rapide

> Guide complet dans **[DEMARRAGE.md](DEMARRAGE.md)**.

1. **Configurer les 2 fichiers `.env`** (racine + `backend/`) — voir DEMARRAGE.md.
2. **Installer** :
   ```bash
   npm install
   cd backend && python -m venv venv && ./venv/Scripts/activate && pip install -r requirements.txt && cd ..
   ```
3. **Ingérer des documents** : déposer des PDF dans `backend/documents/` puis `cd backend && python ingest.py`.
4. **Lancer** (front + back ensemble) :
   ```bash
   npm run dev:all
   ```
   → Frontend http://localhost:5173 · Backend http://localhost:3001

---

## 📁 Structure du projet

```
projethub_chatbitepitech/
├── README.md              # ce fichier
├── ARCHITECTURE.md        # architecture technique détaillée
├── DEMARRAGE.md           # guide d'installation et de lancement
├── docker-compose.yml     # lancement conteneurisé
├── .env                   # config frontend (Supabase — clé anon)
│
├── src/                   # Frontend React
│   ├── components/        # Auth, ChatInterface, AdminPanel, PromoSetup…
│   ├── services/          # appels API (ai, messages, conversations, users, documents…)
│   ├── contexts/          # AuthContext
│   ├── hooks/             # useUserRole, useTheme…
│   ├── lib/               # client Supabase
│   └── types/             # types TypeScript
│
└── backend/               # Backend FastAPI
    ├── .env               # config backend (Gemini + Supabase service_role)
    ├── api/               # routes.py (chat/RAG), admin.py (gestion docs)
    ├── services/          # googleai, embeddings, ingestion, moderation
    ├── models/            # schémas Pydantic
    ├── documents/         # dépôt des fichiers à ingérer
    ├── tests/             # tests pytest
    ├── ingest.py          # script d'ingestion en lot
    ├── config.py          # configuration / variables d'env
    └── main.py            # point d'entrée FastAPI
```

---

## 🧠 Le RAG en bref

**Ingestion** (hors-ligne, `python ingest.py`) :
```
PDF → extraction texte → découpage en chunks (~1500 car., 200 de recouvrement)
    → embedding Gemini (768 dim) → stockage dans Supabase (pgvector)
```

**Retrieval** (à chaque question) :
```
Question → embedding → recherche vectorielle (match_document_chunks, seuil 0.65)
        → top-k passages injectés dans le prompt → génération Gemini (streamée)
```

Le seuil de similarité (`0.65`) a été **calibré sur données réelles** pour séparer le pertinent du hors-sujet. Détails dans [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 🔐 Sécurité

- **Authentification** Supabase : email/mot de passe (restreint à `@epitech.eu`) **ou** Google OAuth.
- **RLS (Row Level Security)** activé sur toutes les tables : chaque étudiant ne voit que ses données ; l'admin voit tout.
- Le **backend** utilise la clé `service_role` (jamais exposée au frontend) ; les endpoints d'administration sont protégés par **vérification du JWT + rôle admin**.

---

## 📚 Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — flux de données, schéma de base de données, pipeline RAG, référence API, modèle de sécurité.
- **[DEMARRAGE.md](DEMARRAGE.md)** — prérequis, configuration `.env`, installation, lancement, ingestion, tests, dépannage.

---

## 🗺️ Pistes d'évolution

- Historique des conversations côté admin plus riche (recherche, export)
- Instrumentation coût/tokens et latence côté serveur
- Détection de contournement plus fine (au-delà des heuristiques par mots-clés)
- Tests end-to-end (frontend)
