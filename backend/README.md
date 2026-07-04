# Backend — Epibot API (FastAPI)

Backend Python/FastAPI qui gère la partie **IA** de l'application : recherche
sémantique (RAG), génération de réponses (Google Gemini), ingestion des
documents et endpoints d'administration.

> Installation, configuration `.env` et lancement : voir **[../DEMARRAGE.md](../DEMARRAGE.md)**.
> Architecture globale et référence API complète : voir **[../ARCHITECTURE.md](../ARCHITECTURE.md)**.

## Structure

```
backend/
├── main.py                       # Point d'entrée FastAPI (+ CORS, routers)
├── start.py                      # Script de démarrage (uvicorn)
├── config.py                     # Variables d'environnement
├── ingest.py                     # Ingestion en lot (CLI) de backend/documents/
├── requirements.txt
│
├── api/
│   ├── routes.py                 # /api/chat  (chat, stream, upload, health) + RAG
│   └── admin.py                  # /api/admin (gestion des documents, protégé JWT admin)
│
├── services/
│   ├── googleai_service.py       # Génération Gemini (chat + streaming)
│   ├── embeddings_service.py     # Embeddings Gemini (gemini-embedding-001, 768d)
│   ├── ingestion_service.py      # Extraction + découpage + encodage + stockage
│   └── moderation_service.py     # Détection heuristique de contournement
│
├── models/
│   └── chat_models.py            # Schémas Pydantic (requêtes / réponses)
│
├── documents/                    # Fichiers à ingérer (PDF / txt / md)
└── tests/
    └── test_ingestion.py         # Tests pytest (fonctions pures)
```

## Variables d'environnement (`backend/.env`)

```env
GEMINI_API_KEY=...                # clé Google AI Studio (chat + embeddings)
SUPABASE_URL=https://<projet>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...     # clé service_role (secrète, bypasse le RLS)
```

## Endpoints

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `POST` | `/api/chat/chat` | — | Réponse complète (non-streamée) |
| `POST` | `/api/chat/stream` | — | Réponse streamée (ndjson) |
| `POST` | `/api/chat/upload` | — | Upload d'un fichier texte brut |
| `GET`  | `/api/chat/health` | — | Santé de l'API |
| `GET`  | `/api/admin/documents` | admin | Liste des documents |
| `POST` | `/api/admin/documents` | admin | Upload + ingestion |
| `DELETE` | `/api/admin/documents/{id}` | admin | Suppression (cascade) |

Documentation interactive : http://localhost:3001/docs

## Ingestion & tests

```bash
python ingest.py     # ingère les fichiers de backend/documents/
pytest               # lance les tests unitaires
```
