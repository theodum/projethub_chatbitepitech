# Guide de démarrage

## Démarrage rapide

### 1. Configuration

Créez les fichiers de configuration :

**1. `.env` à la racine** (pour Supabase) :
```env
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre_cle_anon_ici
```

**2. `backend/.env`** (pour Google AI Studio) :
```env
GEMINI_API_KEY=votre_cle_api_google_ici
# OU
# GOOGLE_API_KEY=votre_cle_api_google_ici
```

### 2. Installation du backend Python

**Sur macOS :**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Sur Ubuntu/Linux :**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Démarrer l'application

**Terminal 1 - Backend Python :**

*Option automatique (détecte l'OS) :*
```bash
npm run dev:api
```

*Option spécifique macOS :*
```bash
npm run dev:api:mac
```

*Option spécifique Ubuntu/Linux :*
```bash
npm run dev:api:linux
```

**Terminal 2 - Frontend :**
```bash
npm run dev
```

## Démarrage avec Docker (recommandé équipe)

```bash
docker compose up --build
```

- Frontend : http://localhost:5173
- Backend : http://localhost:3001

### 4. Accéder à l'application

- Frontend : http://localhost:5173
- Backend API : http://localhost:3001
- Documentation API : http://localhost:3001/docs

## Dépannage

### Erreur "Impossible de se connecter au backend"

1. Verifiez que le backend est demarre : `npm run dev:api`
2. Verifiez votre cle API dans `backend/.env`
3. Redemarrez les deux serveurs apres modification

### Erreur "Cle API Google non configuree"

- Verifiez que le fichier `backend/.env` existe
- Verifiez que `GOOGLE_API_KEY` est defini dans `backend/.env`
- Redemarrez le backend apres avoir ajoute la cle

## Notes

- Le backend Python est necessaire pour eviter les problemes CORS
- La cle API Google est lue par le backend, pas par le frontend
- Les deux serveurs doivent tourner en meme temps
