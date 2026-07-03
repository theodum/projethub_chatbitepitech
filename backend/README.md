# Backend Python - Epibot API

Backend structure en Python avec FastAPI pour gerer les appels API Google AI Studio (Gemini)

## Structure du projet

```
backend/
├── main.py                 # Point d'entree de l'application
├── config.py              # Configuration et variables d'environnement
├── requirements.txt       # Dependances Python
├── .env.example          # Exemple de fichier de configuration
│
├── api/                  # Routes API
│   ├── __init__.py
│   └── routes.py         # Definition des endpoints
│
├── services/             # Services metier
│   ├── __init__.py
│   └── googleai_service.py  # Service pour Google AI Studio
│
└── models/               # Modeles de donnees (Pydantic)
    ├── __init__.py
    └── chat_models.py    # Modeles pour les requetes/reponses
```

## Installation

1. **Creer un environnement virtuel** :
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

2. **Installer les dependances** :
```bash
pip install -r requirements.txt
```

3. **Configurer l'environnement** :
```bash
cp .env.example .env
# Editez .env et ajoutez votre cle API Google AI Studio
# GOOGLE_API_KEY=AIzaSy...
```

## Demarrage

### Option 1 : Avec npm (depuis la racine)
```bash
npm run dev:api
```

### Option 2 : Directement avec Python
```bash
cd backend
python3 main.py
```

### Option 3 : Avec uvicorn directement
```bash
cd backend
uvicorn main:app --reload --port 3001
```

## API Endpoints

- `POST /api/chat/chat` - Generer une reponse a partir d'un message
- `GET /api/chat/health` - Verifier l'etat de l'API

## Architecture

### Separation des responsabilites

- **`config.py`** : Configuration centralisee
- **`services/`** : Logique metier (appels API externes)
- **`api/routes.py`** : Routes HTTP (controleurs)
- **`models/`** : Modeles de donnees (validation avec Pydantic)

### Avantages de cette structure

- **Maintenabilite** : Code organise et facile a comprendre
- **Testabilite** : Services isoles, faciles a tester
- **Extensibilite** : Facile d'ajouter de nouveaux services
- **Type safety** : Validation automatique avec Pydantic

## Ajouter un nouveau service

1. Creer un fichier dans `services/` (ex: `supabase_service.py`)
2. Implementer la logique metier
3. L'utiliser dans `api/routes.py` si necessaire

## Documentation API

Une fois le serveur demarre, accedez a :
- **Swagger UI** : http://localhost:3001/docs
- **ReDoc** : http://localhost:3001/redoc
