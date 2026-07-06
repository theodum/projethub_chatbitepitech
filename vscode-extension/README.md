# Epibot Guard — extension VS Code

Détecte les **collages massifs de code** dans l'éditeur et les signale à Epibot
(garde-fou pédagogique). Complète le garde-fou du chat : la triche par copier-coller
depuis une source externe est tracée dans l'onglet **Modération** de l'admin.

## Comment ça marche

1. L'extension écoute les modifications du document (`onDidChangeTextDocument`).
2. Quand un **seul changement insère beaucoup de lignes d'un coup** (typique du coller),
   elle envoie l'extrait au backend Epibot.
3. Le backend demande à l'IA **si c'est du code** ; si oui, il trace l'événement
   (`code_paste_events`) rattaché à l'étudiant via son token.

La frappe normale (1 caractère par évènement) n'est **jamais** signalée.

## Installation (développement)

```bash
cd vscode-extension
npm install
npm run compile
```

Puis, dans VS Code, ouvre le dossier `vscode-extension` et appuie sur **F5** :
une fenêtre « Extension Development Host » s'ouvre avec l'extension chargée.

## Configuration

1. Génère un token depuis Epibot : **Mon compte → Extension VS Code → Générer un token**.
2. Dans la fenêtre de test : `Ctrl+Shift+P` → **Epibot : Configurer le token** → colle-le.
   Le token est stocké de façon **chiffrée** (`context.secrets`), jamais en clair.

### Réglages (`Ctrl+,` → Epibot Guard)

| Réglage | Défaut | Rôle |
|--------|--------|------|
| `epibotGuard.apiUrl` | `http://localhost:3001` | URL du backend Epibot |
| `epibotGuard.pasteLineThreshold` | `10` | Lignes collées d'un coup avant signalement |
| `epibotGuard.enabled` | `true` | Active / désactive la surveillance |

## Test rapide

Colle un bloc de 15+ lignes de code C dans un fichier `.c` de la fenêtre de test.
La barre d'état affiche « collage signalé (c) », et l'événement apparaît dans l'admin.
