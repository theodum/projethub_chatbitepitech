# 🏗️ Architecture du projet

## Vue d'ensemble

Le projet est organisé en deux parties principales :
- **Frontend** : React + TypeScript (dans `src/`)
- **Backend** : Python + FastAPI (dans `backend/`)

## 📁 Structure du projet

```
chatbot-week/
├── frontend/ (src/)
│   ├── components/          # Composants React réutilisables
│   │   ├── Auth.tsx
│   │   ├── ChatInterface.tsx
│   │   └── ...
│   ├── services/           # Services frontend (appels API)
│   │   ├── aiService.ts      # Service pour Google AI
│   │   ├── messagesService.ts
│   │   └── usersService.ts
│   ├── contexts/           # Contextes React (Auth, etc.)
│   ├── hooks/              # Hooks personnalisés
│   └── types/              # Types TypeScript
│
└── backend/                # Backend Python
    ├── api/                # Routes API (contrôleurs)
    │   └── routes.py
    ├── services/           # Services métier
    │   └── googleai_service.py
    ├── models/             # Modèles de données (Pydantic)
    │   └── chat_models.py
    ├── config.py           # Configuration
    └── main.py             # Point d'entrée
```

## 🎯 Principes d'organisation

### Frontend (React)

**Séparation par responsabilité** :
- **Components** : UI réutilisable
- **Services** : Logique d'appels API
- **Contexts** : État global (Auth, etc.)
- **Hooks** : Logique réutilisable
- **Types** : Définitions TypeScript

### Backend (Python)

**Architecture en couches** :
- **API/Routes** : Points d'entrée HTTP (contrôleurs)
- **Services** : Logique métier (appels API externes)
- **Models** : Validation et structure des données
- **Config** : Configuration centralisée

## 🔄 Flux de données

```
Utilisateur
    ↓
Frontend (React)
    ↓
Service Frontend (aiService.ts - Google AI)
    ↓
Backend API (FastAPI)
    ↓
Service Backend (googleai_service.py)
    ↓
API Externe (Google AI Studio)
```

## ✅ Avantages de cette structure

1. **Maintenabilité** : Code organisé et facile à trouver
2. **Testabilité** : Services isolés, faciles à tester
3. **Extensibilité** : Facile d'ajouter de nouvelles fonctionnalités
4. **Séparation des responsabilités** : Chaque partie a un rôle clair
5. **Type safety** : TypeScript côté frontend, Pydantic côté backend

## 🆕 Ajouter une nouvelle fonctionnalité

### Frontend
1. Créer un composant dans `components/`
2. Créer un service dans `services/` si besoin d'appels API
3. Ajouter les types dans `types/` si nécessaire

### Backend
1. Créer un service dans `services/`
2. Ajouter une route dans `api/routes.py`
3. Créer un modèle dans `models/` si nécessaire

## 📚 Documentation

- Frontend : Voir les commentaires dans les fichiers
- Backend : `backend/README.md`
- API : http://localhost:3001/docs (Swagger UI)
