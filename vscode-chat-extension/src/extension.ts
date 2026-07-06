import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { getWebviewHtml } from './webview';

const TOKEN_KEY = 'epibotChat.token';

export function activate(context: vscode.ExtensionContext) {
  const provider = new EpibotViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('epibot.chat', provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('epibotChat.setToken', () => provider.promptToken())
  );

  // Envoyer la sélection courante au chat (menu contextuel de l'éditeur).
  context.subscriptions.push(
    vscode.commands.registerCommand('epibotChat.attachSelection', () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed) return;
      const sel = ed.document.getText(ed.selection) || ed.document.getText();
      const name = ed.document.fileName.split(/[\\/]/).pop() || 'selection';
      provider.attachCode(name, sel);
    })
  );
}

class EpibotViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(private context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = getWebviewHtml(view.webview, this.context.extensionUri);

    view.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'ready':
          this.pushState();
          break;
        case 'setToken':
          await this.promptToken();
          break;
        case 'listConversations':
          await this.apiToWebview('GET', '/api/ext/conversations', null, 'conversations');
          break;
        case 'newConversation': {
          const res = await this.api('POST', '/api/ext/conversations', { title: 'Nouvelle conversation' });
          this.post({ type: 'conversationCreated', conversation: res });
          break;
        }
        case 'loadMessages':
          await this.apiToWebview('GET', `/api/ext/conversations/${msg.conversationId}/messages`, null, 'messages', { conversationId: msg.conversationId });
          break;
        case 'send':
          await this.streamChat(msg.text, msg.conversationId, msg.history);
          break;
        case 'feedback':
          await this.api('POST', `/api/ext/messages/${msg.messageId}/feedback`, { feedback: msg.value }).catch(() => {});
          break;
        case 'attachCurrentFile': {
          const ed = vscode.window.activeTextEditor;
          if (!ed) { this.post({ type: 'toast', text: 'Aucun fichier ouvert.' }); break; }
          const name = ed.document.fileName.split(/[\\/]/).pop() || 'fichier';
          this.post({ type: 'codeAttached', name, content: ed.document.getText() });
          break;
        }
      }
    });
  }

  attachCode(name: string, content: string) {
    this.view?.show?.(true);
    this.post({ type: 'codeAttached', name, content });
  }

  async promptToken() {
    const token = await vscode.window.showInputBox({
      prompt: 'Collez votre token Epibot (depuis « Mon compte » sur l\'app).',
      placeHolder: 'epibot_xxxxxxxx',
      password: true,
      ignoreFocusOut: true,
    });
    if (token && token.trim()) {
      await this.context.secrets.store(TOKEN_KEY, token.trim());
      vscode.window.showInformationMessage('Epibot : token enregistré.');
      this.pushState();
    }
  }

  private async pushState() {
    const token = await this.context.secrets.get(TOKEN_KEY);
    this.post({ type: 'state', hasToken: !!token });
    if (token) {
      this.apiToWebview('GET', '/api/ext/conversations', null, 'conversations').catch(() => {});
    }
  }

  private post(msg: unknown) {
    this.view?.webview.postMessage(msg);
  }

  private apiUrl(): string {
    return vscode.workspace.getConfiguration('epibotChat').get<string>('apiUrl', 'http://localhost:3001');
  }

  private async api(method: string, path: string, body: unknown): Promise<any> {
    const token = await this.context.secrets.get(TOKEN_KEY);
    if (!token) throw new Error('no-token');
    return requestJson(method, `${this.apiUrl()}${path}`, body, token);
  }

  private async apiToWebview(method: string, path: string, body: unknown, kind: string, extra: object = {}) {
    try {
      const data = await this.api(method, path, body);
      this.post({ type: kind, data, ...extra });
    } catch (e) {
      this.post({ type: 'error', message: e instanceof Error ? e.message : 'Erreur' });
    }
  }

  /** Chat streamé : lit le ndjson et pousse les deltas à la webview. */
  private async streamChat(text: string, conversationId: string | null, history: any[]) {
    const token = await this.context.secrets.get(TOKEN_KEY);
    if (!token) { this.post({ type: 'error', message: 'Token non configuré.' }); return; }

    const url = new URL(`${this.apiUrl()}/api/ext/chat/stream`);
    const lib = url.protocol === 'https:' ? https : http;
    const payload = JSON.stringify({ message: text, conversation_id: conversationId, conversation_history: history });

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) this.handleStreamLine(line);
        });
        res.on('end', () => { if (buffer.trim()) this.handleStreamLine(buffer); });
      }
    );
    req.on('error', (err) => this.post({ type: 'error', message: String(err) }));
    req.write(payload);
    req.end();
  }

  private handleStreamLine(line: string) {
    if (!line.trim()) return;
    try {
      const ev = JSON.parse(line);
      this.post({ type: 'stream', event: ev });
    } catch {
      /* ligne partielle ignorée */
    }
  }
}

/** POST/GET JSON via http natif. */
function requestJson(method: string, urlStr: string, body: unknown, bearer: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const data = body ? JSON.stringify(body) : undefined;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          Authorization: `Bearer ${bearer}`,
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            let detail = `Erreur ${res.statusCode}`;
            try { detail = JSON.parse(raw).detail || detail; } catch {}
            reject(new Error(detail));
          } else {
            try { resolve(raw ? JSON.parse(raw) : null); } catch { resolve(null); }
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

export function deactivate() {}
