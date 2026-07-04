# 🚀 Guide de démarrage — Epibot

## Prérequis

- **Node.js** 18+ et npm
- **Python** 3.10+
- Un **projet Supabase** (les migrations SQL du projet doivent y être appliquées)
- Une **clé API Google Gemini** ([Google AI Studio](https://aistudio.google.com/app/apikey))

---

## 1. Configuration des variables d'environnement

Deux fichiers `.env` sont nécessaires.

### `.env` à la racine (frontend)
```env
VITE_SUPABASE_URL=https://<ton-projet>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon publique>
```

### `backend/.env` (backend)
```env
# Google AI Studio (chat + embeddings)
GEMINI_API_KEY=<ta clé Gemini>

# Supabase — le backend utilise la clé service_role (bypasse le RLS).
# NE JAMAIS committer ni exposer cette clé.
SUPABASE_URL=https://<ton-projet>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<clé service_role secrète>
```

> **Où trouver les clés Supabase** : Dashboard → *Project Settings → API*.
> - `anon` (publique) → `VITE_SUPABASE_ANON_KEY`
> - `service_role` (**secrète**) → `SUPABASE_SERVICE_ROLE_KEY`
>
> Les fichiers `.env` sont ignorés par git (`.gitignore`).

---

## 2. Installation

### Frontend
```bash
npm install
```

### Backend
```bash
cd backend
python -m venv venv

# Activer le venv :
#   Windows (PowerShell) :  .\venv\Scripts\Activate.ps1
#   macOS / Linux        :  source venv/bin/activate

pip install -r requirements.txt
cd ..
```

---

## 3. Ingérer des documents dans le RAG

1. Déposer les fichiers (**PDF texte**, `.txt` ou `.md`) dans `backend/documents/`.
2. Lancer l'ingestion :
   ```bash
   cd backend
   python ingest.py
   ```
   → affiche, pour chaque fichier, le nombre de chunks ingérés.

> Les PDF **scannés / images** n'ont pas de texte extractible (il faudrait de l'OCR).
> On peut aussi ajouter des documents depuis l'**onglet Docs** de l'interface admin.

---

## 4. Lancer l'application

### Option A — Tout en une commande (recommandé)
```bash
npm run dev:all
```
Lance le backend et le frontend ensemble.
> Utilise `dev:api:win` (Windows). Sur macOS/Linux, adapter le script `dev:api` du `package.json` ou lancer les deux séparément (Option C).

### Option B — Docker
```bash
docker compose up --build
```
Installe les dépendances et lance les deux services dans des conteneurs (nécessite Docker Desktop + les deux `.env`).

### Option C — Séparément (2 terminaux)
```bash
# Terminal 1 — backend
cd backend
# venv activé…
python start.py

# Terminal 2 — frontend
npm run dev
```

Accès :
- **Frontend** : http://localhost:5173
- **Backend** : http://localhost:3001
- **API (Swagger)** : http://localhost:3001/docs

---

## 5. Créer un compte administrateur

1. S'inscrire via l'application (email `@epitech.eu` ou Google) — le profil est créé automatiquement.
2. Passer le rôle à `admin` (dans le SQL Editor de Supabase) :
   ```sql
   update public.users set role = 'admin' where email = 'ton.email@epitech.eu';
   ```
3. Rafraîchir la page → tu es routé vers le panneau d'administration.

---

## 6. Lancer les tests

```bash
cd backend
# venv activé…
pytest
```

---

## 🛠️ Dépannage

### La connexion Google échoue (`provider is not enabled`)
Le provider Google n'est pas activé sur le projet Supabase.
→ *Auth → Providers → Google* : activer + renseigner le Client ID/Secret (Google Cloud Console).
Ajouter aussi l'URL de redirection `https://<projet>.supabase.co/auth/v1/callback` côté Google, et `http://localhost:5173` dans *Auth → URL Configuration*.

### « Unable to exchange external code » après Google
Client Secret incorrect côté Supabase, ou redirect URI mal renseigné côté Google. Vérifier les deux.

### Une modification du chat / de la modération ne « prend » pas
Après un changement touchant le flux de chat : **redémarrer le backend** *et* **rafraîchir le navigateur à fond** (Ctrl+Shift+R). L'ancien JS en cache est la cause n°1 des comportements « qui ne marchent plus ».

### « Impossible de se connecter au backend »
Vérifier que le backend tourne (`http://localhost:3001/api/chat/health`) et que `backend/.env` est bien rempli (clé Gemini + Supabase).

### Le bot répond mais sans utiliser mes documents
- Les documents ont-ils été ingérés (`python ingest.py`) ?
- La question est peut-être hors du corpus (similarité sous le seuil 0.65) → le bot le dit alors explicitement.

### Le RAG répond même à des questions hors-sujet
Le seuil est trop permissif pour ton corpus → augmenter `match_threshold` dans `backend/api/routes.py` (`retrieve_context`).
