import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

const TOKEN_KEY = 'epibotGuard.token';

let statusBar: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'epibotGuard.status';
  context.subscriptions.push(statusBar);
  refreshStatusBar(context);

  // Commande : configurer le token (collé depuis le compte Epibot)
  context.subscriptions.push(
    vscode.commands.registerCommand('epibotGuard.setToken', async () => {
      const token = await vscode.window.showInputBox({
        prompt: 'Collez votre token Epibot (généré depuis votre compte, onglet « Mon compte »).',
        placeHolder: 'epibot_xxxxxxxx',
        password: true,
        ignoreFocusOut: true,
      });
      if (token && token.trim()) {
        await context.secrets.store(TOKEN_KEY, token.trim());
        vscode.window.showInformationMessage('Epibot : token enregistré. La surveillance est active.');
        refreshStatusBar(context);
      }
    })
  );

  // Commande : afficher l'état
  context.subscriptions.push(
    vscode.commands.registerCommand('epibotGuard.status', async () => {
      const token = await context.secrets.get(TOKEN_KEY);
      if (!token) {
        const choice = await vscode.window.showWarningMessage(
          'Epibot : aucun token configuré. La surveillance est inactive.',
          'Configurer le token'
        );
        if (choice) {
          vscode.commands.executeCommand('epibotGuard.setToken');
        }
      } else {
        vscode.window.showInformationMessage('Epibot : surveillance active ✓');
      }
    })
  );

  // Au premier lancement sans token : inviter à se connecter
  context.secrets.get(TOKEN_KEY).then((token) => {
    if (!token) {
      vscode.window
        .showInformationMessage(
          'Epibot Guard : connectez votre compte pour activer la surveillance des collages.',
          'Configurer le token'
        )
        .then((choice) => {
          if (choice) {
            vscode.commands.executeCommand('epibotGuard.setToken');
          }
        });
    }
  });

  // Détection des collages
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => onDocumentChange(event, context))
  );
}

async function onDocumentChange(
  event: vscode.TextDocumentChangeEvent,
  context: vscode.ExtensionContext
) {
  const config = vscode.workspace.getConfiguration('epibotGuard');
  if (!config.get<boolean>('enabled', true)) {
    return;
  }

  const doc = event.document;
  // Ignorer les documents non-fichiers (sortie, terminal, git, etc.)
  if (doc.uri.scheme !== 'file') {
    return;
  }

  const threshold = config.get<number>('pasteLineThreshold', 10);

  // Un collage = un seul changement qui insère plusieurs lignes d'un coup.
  // La frappe normale génère de petits changements (1 caractère) ;
  // un undo/format touche plusieurs endroits. On cible le gros insert unique.
  for (const change of event.contentChanges) {
    const insertedText = change.text;
    if (!insertedText) {
      continue; // suppression, pas un collage
    }
    const lineCount = insertedText.split('\n').length;
    // Heuristique : beaucoup de lignes ET une taille conséquente,
    // dans un seul évènement de changement (typique du coller).
    if (lineCount >= threshold && insertedText.length > 80) {
      await reportPaste(context, {
        file_name: workspaceRelative(doc.uri),
        line_count: lineCount,
        content: insertedText,
      });
      break; // un signalement suffit par évènement
    }
  }
}

function workspaceRelative(uri: vscode.Uri): string {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (folder) {
    return uri.fsPath.slice(folder.uri.fsPath.length + 1);
  }
  return uri.path.split('/').pop() || uri.fsPath;
}

interface PastePayload {
  file_name: string;
  line_count: number;
  content: string;
}

async function reportPaste(context: vscode.ExtensionContext, payload: PastePayload) {
  const token = await context.secrets.get(TOKEN_KEY);
  if (!token) {
    return; // pas configuré : on ne fait rien (silencieux)
  }
  const config = vscode.workspace.getConfiguration('epibotGuard');
  const apiUrl = config.get<string>('apiUrl', 'http://localhost:3001');

  try {
    const res = await postJson(`${apiUrl}/api/moderation/paste`, payload, token);
    if (res && res.tracked) {
      const lang = res.language ? ` (${res.language})` : '';
      statusBar.text = `$(shield) Epibot : collage signalé${lang}`;
      setTimeout(() => refreshStatusBar(context), 4000);
    }
  } catch (err) {
    // Silencieux : ne pas gêner l'utilisateur si le backend est down.
    console.error('Epibot Guard: échec du signalement', err);
  }
}

async function refreshStatusBar(context: vscode.ExtensionContext) {
  const token = await context.secrets.get(TOKEN_KEY);
  statusBar.text = token ? '$(shield) Epibot' : '$(shield) Epibot : hors ligne';
  statusBar.tooltip = token
    ? 'Surveillance des collages active'
    : 'Cliquez pour configurer le token Epibot';
  statusBar.show();
}

/**
 * POST JSON minimal via http/https natif (pas de dépendance externe).
 */
function postJson(
  urlStr: string,
  body: unknown,
  bearer: string
): Promise<{ tracked?: boolean; language?: string } | null> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const data = JSON.stringify(body);
    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Authorization: `Bearer ${bearer}`,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve(raw ? JSON.parse(raw) : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

export function deactivate() {
  // rien à nettoyer (subscriptions gérées par context)
}
