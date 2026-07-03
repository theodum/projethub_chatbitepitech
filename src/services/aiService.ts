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
}

/**
 * Envoyer un message au backend et obtenir la réponse + les métadonnées RAG
 */
export async function sendMessage(
  userMessage: string,
  conversationHistory: ChatMessage[] = []
): Promise<ChatResult> {
  const apiUrl = '/api/chat/chat';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: userMessage,
        conversation_history: conversationHistory,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.detail || errorData.error || `Erreur ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.response) {
      throw new Error('Réponse invalide du serveur');
    }

    return {
      response: data.response,
      sources: data.sources || [],
      maxSimilarity: data.max_similarity ?? 0,
      contextFound: data.context_found ?? false,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Impossible de se connecter au backend. Assurez-vous que le serveur est demarre (npm run dev:api)');
    }

    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erreur lors de la communication avec le serveur');
  }
}
