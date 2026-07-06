# Epibot — Assistant pédagogique (extension VS Code)

Epibot dans un panneau latéral de VS Code, façon Claude Code / Copilot Chat.
Pose tes questions sur les projets et les cours ; joins ton code pour demander
conseil. Les réponses s'appuient sur tes documents (RAG) et respectent le
garde-fou pédagogique : Epibot t'oriente, il n'écrit pas ton code.

L'historique est **synchronisé** avec l'app web et l'admin (même base).

## Fonctionnalités

- 💬 Chat streamé (RAG + sources affichées)
- 🗂️ Conversations multiples (partagées avec l'app web)
- 👍/👎 Feedback persisté
- 📎 Joindre le **fichier courant** ou la **sélection** (clic droit → « Envoyer la sélection à Epibot »)
- 🎓 Accès filtré par ta **promo** (tek1..tek5), résolu via ton token

## Installation (développement)

```bash
cd vscode-chat-extension
npm install
npm run compile
```

Ouvre le dossier `vscode-chat-extension` dans VS Code, appuie sur **F5** →
une fenêtre « Extension Development Host » s'ouvre avec l'extension chargée.

## Utilisation

1. Le backend Epibot doit tourner (`http://localhost:3001` par défaut ;
   configurable dans les réglages `epibotChat.apiUrl`).
2. Clique l'icône **Epibot** dans la barre latérale → **Configurer le token**.
3. Colle le token généré depuis « Mon compte » sur l'app Epibot.
4. Discute. Utilise 📎 pour joindre ton fichier courant.
