# Guide de demarrage rapide - Backend Python

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
# Creer le fichier .env
cp .env.example .env

# Editer .env et ajouter votre cle API Google AI Studio
# GEMINI_API_KEY=AIzaSy...
# OU
# GOOGLE_API_KEY=AIzaSy...
```

## Demarrage

### Option 1 : Avec npm (depuis la racine du projet) - Recommandé

**macOS :**
```bash
npm run dev:api
# ou explicitement
npm run dev:api:mac
```

**Ubuntu/Linux :**
```bash
npm run dev:api:linux
```

### Option 2 : Directement avec Python
```bash
cd backend
source venv/bin/activate  # Sur Linux/macOS
python3 start.py
```

### Option 3 : Via main.py (alternative)
```bash
cd backend
source venv/bin/activate
python3 main.py
```

## Verification

Une fois demarre, vous pouvez :
- Tester l'API : http://localhost:3001/api/chat/health
- Voir la documentation : http://localhost:3001/docs

## Structure

```
backend/
├── main.py                    # Point d'entree FastAPI
├── start.py                   # Script de demarrage (compatible macOS/Ubuntu)
├── config.py                  # Configuration
├── api/routes.py              # Routes HTTP
├── services/                  # Services metier
│   └── googleai_service.py
└── models/                   # Modeles de donnees
    └── chat_models.py
```
