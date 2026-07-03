import { useState, useEffect } from 'react';
import type { Message } from '../types';
import {
  getAllMessages,
  createMessage,
  updateMessage,
  deleteMessage,
} from '../services/messagesService';
import { useAuth } from '../contexts/AuthContext';

interface MessagesSectionProps {
  connectionStatus: 'checking' | 'connected' | 'error';
}

/**
 * Composant pour gérer les messages
 */
export function MessagesSection({ connectionStatus }: MessagesSectionProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [messageSender, setMessageSender] = useState<'user' | 'bot'>('user');

  const loadMessages = async () => {
    if (connectionStatus !== 'connected') return;

    try {
      setLoading(true);
      setError(null);
      const data = await getAllMessages();
      setMessages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMessage = async () => {
    if (!messageContent.trim()) return;

    try {
      setError(null);
      const newMessage = await createMessage({
        content: messageContent,
        user_id: messageSender === 'user' ? (user?.id || null) : null, // null pour bot, user.id pour utilisateur
      });
      setMessages([newMessage, ...messages]);
      setMessageContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    }
  };

  const handleUpdateMessage = async (id: number, newContent: string) => {
    try {
      setError(null);
      const updated = await updateMessage(id, { content: newContent });
      setMessages(messages.map((m) => (m.id === id ? updated : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
    }
  };

  const handleDeleteMessage = async (id: number) => {
    try {
      setError(null);
      await deleteMessage(id);
      setMessages(messages.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    }
  };

  // Charger les messages quand la connexion est établie
  useEffect(() => {
    if (connectionStatus === 'connected') {
      loadMessages();
    }
  }, [connectionStatus]);

  return (
    <section style={{ marginBottom: '40px' }}>
      <h2>Messages</h2>

      {error && (
        <div
          style={{
            padding: '10px',
            background: '#ffebee',
            color: '#c62828',
            borderRadius: '4px',
            marginBottom: '20px',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <input
          type="text"
          placeholder="Contenu du message"
          value={messageContent}
          onChange={(e) => setMessageContent(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleCreateMessage()}
          style={{ flex: 1, padding: '8px' }}
        />
        <select
          value={messageSender}
          onChange={(e) => setMessageSender(e.target.value as 'user' | 'bot')}
          style={{ padding: '8px' }}
        >
          <option value="user">Utilisateur</option>
          <option value="bot">Bot</option>
        </select>
        <button onClick={handleCreateMessage} style={{ padding: '8px 16px' }}>
          Ajouter
        </button>
      </div>

      {loading ? (
        <p>Chargement...</p>
      ) : (
        <div>
          {messages.length === 0 ? (
            <p>Aucun message</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                style={{
                  padding: '10px',
                  marginBottom: '10px',
                  background: '#f5f5f5',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong>{message.user_id ? 'Utilisateur' : 'Bot'}:</strong> {message.content}
                  {message.created_at && (
                    <small style={{ display: 'block', color: '#666' }}>
                      {new Date(message.created_at).toLocaleString()}
                    </small>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => {
                      const newContent = prompt('Nouveau contenu:', message.content);
                      if (newContent) handleUpdateMessage(message.id!, newContent);
                    }}
                    style={{ padding: '4px 8px' }}
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Supprimer ce message?')) {
                        handleDeleteMessage(message.id!);
                      }
                    }}
                    style={{ padding: '4px 8px', background: '#f44336', color: 'white' }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
