import * as vscode from 'vscode';

/**
 * HTML de la webview du chat Epibot. UI dense « station de travail »
 * (charbon + bleu #013AFB). Communique avec l'extension via postMessage.
 */
export function getWebviewHtml(_webview: vscode.Webview, _extUri: vscode.Uri): string {
  const nonce = String(Date.now()) + Math.floor(Math.random() * 1e6);
  return /* html */ `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  :root {
    --bg: #0C0D10; --panel: #131519; --panel2: #171A1F; --line: #24272E;
    --ink: #E7E9EC; --ink2: #9AA0AB; --ink3: #5D636E;
    --accent: #3B63FF; --accent-fg: #fff; --accent-soft: #15224A;
    --ok: #7FB58A; --warn: #D0A24A;
    --mono: ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace;
    --sans: ui-sans-serif, system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--sans); font-size: 13px; height: 100vh; display: flex; flex-direction: column; }
  button { font-family: inherit; cursor: pointer; }

  /* Onboarding token */
  #onboard { flex: 1; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px; text-align: center; }
  #onboard.on { display: flex; }
  #onboard .brace { font-size: 40px; color: var(--accent); font-weight: 300; }
  #onboard p { color: var(--ink2); max-width: 32ch; line-height: 1.5; }
  .btn { background: var(--accent); color: var(--accent-fg); border: 0; padding: 9px 16px; font-size: 13px; font-weight: 600; }
  .btn.ghost { background: var(--panel2); color: var(--ink); border: 1px solid var(--line); }

  /* Chat */
  #app { flex: 1; display: none; flex-direction: column; min-height: 0; }
  #app.on { display: flex; }
  .top { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--line); background: var(--panel); }
  .top select { flex: 1; background: var(--panel2); color: var(--ink); border: 1px solid var(--line); padding: 5px 7px; font-family: var(--mono); font-size: 11px; }
  .top .ic { background: var(--panel2); border: 1px solid var(--line); color: var(--ink2); padding: 5px 8px; font-size: 12px; }
  .top .ic:hover { border-color: var(--accent); color: var(--accent); }

  #log { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
  .msg { max-width: 92%; }
  .msg .who { font-family: var(--mono); font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink3); margin-bottom: 3px; }
  .msg .bub { border: 1px solid var(--line); padding: 8px 10px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
  .msg.me { align-self: flex-end; }
  .msg.me .bub { background: var(--accent-soft); border-color: #24356e; }
  .msg.me .who { text-align: right; color: #7f92d6; }
  .msg.bot .bub { background: var(--panel); }
  .msg .src { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
  .msg .src span { font-family: var(--mono); font-size: 9px; color: var(--accent); border: 1px solid #23356e; padding: 1px 5px; }
  .msg .fb { margin-top: 5px; display: flex; gap: 6px; }
  .msg .fb button { background: transparent; border: 1px solid var(--line); color: var(--ink3); font-size: 11px; padding: 1px 8px; }
  .msg .fb button:hover { border-color: var(--accent); color: var(--accent); }
  .msg .fb button.done { color: var(--ok); border-color: var(--ok); }
  .typing { color: var(--ink3); font-family: var(--mono); font-size: 11px; }

  /* Composer */
  .attach { margin: 0 10px; display: none; align-items: center; gap: 6px; background: var(--panel2); border: 1px solid var(--line); padding: 5px 8px; font-family: var(--mono); font-size: 11px; }
  .attach.on { display: flex; }
  .attach .x { margin-left: auto; color: var(--ink3); border: 0; background: transparent; }
  .compose { border-top: 1px solid var(--line); background: var(--panel); padding: 8px; display: flex; gap: 6px; align-items: flex-end; }
  .compose textarea { flex: 1; resize: none; background: var(--panel2); color: var(--ink); border: 1px solid var(--line); padding: 7px 8px; font-family: var(--sans); font-size: 13px; min-height: 34px; max-height: 120px; }
  .compose textarea:focus { outline: none; border-color: var(--accent); }
  .compose .paper, .compose .send { border: 1px solid var(--line); background: var(--panel2); color: var(--ink2); padding: 7px 10px; }
  .compose .send { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); font-weight: 600; }
  .compose .paper:hover { border-color: var(--accent); color: var(--accent); }
  #err { color: #ff6a6a; font-size: 11px; padding: 4px 10px; display: none; }
</style>
</head>
<body>
  <div id="onboard">
    <div class="brace">{ }</div>
    <div style="font-weight:600;font-size:15px">Epibot</div>
    <p>Connecte ton compte pour discuter. Génère un token depuis « Mon compte » sur l'app Epibot, puis colle-le ici.</p>
    <button class="btn" id="tokBtn">Configurer le token</button>
  </div>

  <div id="app">
    <div class="top">
      <select id="convSel"></select>
      <button class="ic" id="newBtn" title="Nouvelle discussion">+</button>
    </div>
    <div id="err"></div>
    <div id="log"></div>
    <div class="attach" id="attach">
      <span>📎</span><span id="attachName"></span>
      <button class="x" id="attachX">✕</button>
    </div>
    <div class="compose">
      <button class="paper" id="paperBtn" title="Joindre le fichier courant">📎</button>
      <textarea id="input" rows="1" placeholder="Pose ta question à Epibot…"></textarea>
      <button class="send" id="sendBtn">↵</button>
    </div>
  </div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  let convId = null;
  let messages = [];          // {id?, role:'user'|'bot', text, sources?, dbId?}
  let attachment = null;      // {name, content}
  let streamingBot = null;    // message bot en cours

  function post(m){ vscode.postMessage(m); }
  window.addEventListener('load', () => post({ type: 'ready' }));

  // ---- Rendu ----
  function render() {
    const log = $('log'); log.innerHTML = '';
    for (const m of messages) {
      const wrap = document.createElement('div');
      wrap.className = 'msg ' + (m.role === 'user' ? 'me' : 'bot');
      const who = document.createElement('div'); who.className = 'who';
      who.textContent = m.role === 'user' ? 'Vous' : 'Epibot';
      const bub = document.createElement('div'); bub.className = 'bub'; bub.textContent = m.text || '…';
      wrap.appendChild(who); wrap.appendChild(bub);
      if (m.role === 'bot' && m.sources && m.sources.length) {
        const s = document.createElement('div'); s.className = 'src';
        m.sources.forEach(x => { const t = document.createElement('span'); t.textContent = '📎 ' + x; s.appendChild(t); });
        wrap.appendChild(s);
      }
      if (m.role === 'bot' && m.dbId) {
        const fb = document.createElement('div'); fb.className = 'fb';
        const up = document.createElement('button'); up.textContent = '👍';
        const down = document.createElement('button'); down.textContent = '👎';
        if (m.feedback === 'up') up.classList.add('done');
        if (m.feedback === 'down') down.classList.add('done');
        up.onclick = () => sendFeedback(m, 'up');
        down.onclick = () => sendFeedback(m, 'down');
        fb.appendChild(up); fb.appendChild(down); wrap.appendChild(fb);
      }
      log.appendChild(wrap);
    }
    log.scrollTop = log.scrollHeight;
  }

  function sendFeedback(m, val) {
    m.feedback = val; render();
    post({ type: 'feedback', messageId: m.dbId, value: val });
  }

  // ---- Envoi ----
  function send() {
    const text = $('input').value.trim();
    if (!text && !attachment) return;
    const displayText = attachment ? (text + (text ? '\\n\\n' : '') + '📎 ' + attachment.name) : text;
    messages.push({ role: 'user', text: displayText });
    // Historique pour l'IA (avant d'ajouter la bulle bot).
    const history = messages.filter(m => m.text).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
    // Texte réellement envoyé (avec le contenu du fichier).
    const aiText = attachment ? (text + '\\n\\n[Fichier joint : ' + attachment.name + ']\\n\\\`\\\`\\\`\\n' + attachment.content + '\\n\\\`\\\`\\\`') : text;
    streamingBot = { role: 'bot', text: '', sources: [] };
    messages.push(streamingBot);
    $('input').value = ''; clearAttach(); render();
    post({ type: 'send', text: aiText, conversationId: convId, history });
  }

  $('sendBtn').onclick = send;
  $('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  $('input').addEventListener('input', (e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; });

  // ---- Pièce jointe ----
  $('paperBtn').onclick = () => post({ type: 'attachCurrentFile' });
  $('attachX').onclick = clearAttach;
  function setAttach(name, content) { attachment = { name, content }; $('attachName').textContent = name; $('attach').classList.add('on'); }
  function clearAttach() { attachment = null; $('attach').classList.remove('on'); }

  // ---- Conversations ----
  $('newBtn').onclick = () => post({ type: 'newConversation' });
  $('convSel').onchange = (e) => { convId = e.target.value; post({ type: 'loadMessages', conversationId: convId }); };
  $('tokBtn').onclick = () => post({ type: 'setToken' });

  function fillConversations(list) {
    const sel = $('convSel'); sel.innerHTML = '';
    (list || []).forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.title || 'Conversation'; sel.appendChild(o); });
    if (list && list.length) { convId = list[0].id; sel.value = convId; post({ type: 'loadMessages', conversationId: convId }); }
    else { convId = null; messages = []; render(); }
  }

  // ---- Réception depuis l'extension ----
  window.addEventListener('message', (e) => {
    const m = e.data;
    switch (m.type) {
      case 'state':
        $('onboard').classList.toggle('on', !m.hasToken);
        $('app').classList.toggle('on', m.hasToken);
        break;
      case 'conversations':
        fillConversations(m.data);
        break;
      case 'conversationCreated':
        convId = m.conversation.id; messages = []; render();
        post({ type: 'listConversations' });
        break;
      case 'messages': {
        // data = [{id, content, user_id, feedback, rag_sources}]
        messages = (m.data || []).map(x => ({
          role: x.user_id ? 'user' : 'bot',
          text: x.content,
          dbId: x.id,
          feedback: x.feedback,
          sources: Array.isArray(x.rag_sources) ? x.rag_sources : [],
        }));
        render();
        break;
      }
      case 'stream': {
        const ev = m.event;
        if (ev.type === 'meta') {
          if (ev.conversation_id && !convId) { convId = ev.conversation_id; post({ type: 'listConversations' }); }
          if (streamingBot) streamingBot.sources = ev.sources || [];
        } else if (ev.type === 'delta') {
          if (streamingBot) { streamingBot.text += ev.text; render(); }
        } else if (ev.type === 'done') {
          if (streamingBot && ev.message_id) streamingBot.dbId = ev.message_id;
          streamingBot = null; render();
        } else if (ev.type === 'error') {
          if (streamingBot) { streamingBot.text += '\\n\\n⚠️ ' + (ev.detail || 'Erreur'); render(); }
          streamingBot = null;
        }
        break;
      }
      case 'codeAttached':
        setAttach(m.name, m.content);
        break;
      case 'error':
        $('err').textContent = m.message; $('err').style.display = 'block';
        setTimeout(() => { $('err').style.display = 'none'; }, 5000);
        break;
      case 'toast':
        $('err').textContent = m.text; $('err').style.display = 'block';
        setTimeout(() => { $('err').style.display = 'none'; }, 3000);
        break;
    }
  });
</script>
</body>
</html>`;
}
