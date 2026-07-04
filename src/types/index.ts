/**
 * Types pour les messages
 */
export interface Message {
  id?: number;
  content: string;
  user_id?: string | null; // UUID de l'utilisateur, null pour les messages du bot
  conversation_id?: string | null;
  created_at?: string;
  feedback?: 'up' | 'down' | null;      // avis de l'utilisateur sur une réponse du bot
  rag_similarity?: number | null;       // similarité du meilleur passage RAG
  rag_sources?: string[] | null;        // titres des documents utilisés
  rag_context_found?: boolean | null;   // un contexte RAG a-t-il été trouvé ?
  flagged?: boolean | null;             // tentative de contournement du garde-fou (modération)
}

/**
 * Types pour les utilisateurs
 */
export interface User {
  id?: string; // UUID
  name: string | null;
  email: string;
  auth_provider?: string;
  avatar_url?: string | null;
  role?: 'user' | 'admin';
  promo?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface AdminAlert {
  id?: number;
  user_id?: string | null;
  alert_date: string;
  type: 'usage';
  message: string;
  created_at?: string;
}

export interface Conversation {
  id?: string;
  user_id?: string | null;
  title: string | null;
  created_at?: string;
}
