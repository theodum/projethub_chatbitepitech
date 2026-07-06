/**
 * Service pour interagir avec l'API Google AI Studio (Gemini) via le backend Python
 */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  response: string;
  sources: string[];
  maxSimilarity: number;
  contextFound: boolean;
  flagged: boolean;
}

function toClientError(error: unknown): Error {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new Error('Impossible de se connecter au backend. Assurez-vous que le serveur est demarre (npm run dev:api)');
  }
  if (error instanceof Error) return error;
  return new Error('Erreur lors de la communication avec le serveur');
}

/**
 * Envoi non-streamé : réponse complète en une fois (endpoint /chat).
 */
export async function sendMessage(
  userMessage: string,
  conversationHistory: ChatMessage[] = []
): Promise<ChatResult> {
  try {
    const response = await fetch('/api/chat/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage, conversation_history: conversationHistory }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.error || `Erreur ${response.status}`);
    }

    const data = await response.json();
    if (!data.response) throw new Error('Réponse invalide du serveur');

    return {
      response: data.response,
      sources: data.sources || [],
      maxSimilarity: data.max_similarity ?? 0,
      contextFound: data.context_found ?? false,
      flagged: data.flagged ?? false,
    };
  } catch (error) {
    throw toClientError(error);
  }
}

/**
 * Envoi streamé (endpoint /stream) : `onDelta` est appelé pour chaque morceau
 * de texte reçu. Retourne le résultat complet (texte + métadonnées RAG) à la fin.
 */
export async function sendMessageStream(
  userMessage: string,
  conversationHistory: ChatMessage[],
  onDelta: (text: string) => void,
  userPromo?: number | null
): Promise<ChatResult> {
  let response: Response;
  try {
    response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMessage,
        conversation_history: conversationHistory,
        user_promo: userPromo ?? null,
      }),
    });
  } catch (error) {
    throw toClientError(error);
  }

  if (!response.ok || !response.body) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || errorData.error || `Erreur ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  const result: ChatResult = {
    response: '',
    sources: [],
    maxSimilarity: 0,
    contextFound: false,
    flagged: false,
  };

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'meta') {
      result.sources = event.sources || [];
      result.maxSimilarity = event.max_similarity ?? 0;
      result.contextFound = event.context_found ?? false;
      result.flagged = event.flagged ?? false;
    } else if (event.type === 'delta') {
      fullText += event.text;
      onDelta(event.text);
    } else if (event.type === 'error') {
      throw new Error(event.detail || 'Erreur lors de la génération');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // garder l'éventuelle ligne incomplète
    for (const line of lines) handleLine(line);
  }
  if (buffer.trim()) handleLine(buffer);

  result.response = fullText;
  return result;
}
