import type { User as SupabaseUser } from '@supabase/supabase-js';

interface UserHeaderProps {
  user: SupabaseUser;
  onSignOut: () => void;
}

/**
 * Composant pour afficher l'en-tête avec les informations de l'utilisateur
 */
export function UserHeader({ user, onSignOut }: UserHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '30px',
        paddingBottom: '20px',
        borderBottom: '2px solid #eee',
      }}
    >
      <div>
        <h1 style={{ margin: 0 }}>Chatbot avec Supabase</h1>
        <p style={{ margin: '5px 0 0 0', color: '#666' }}>
          Connecté en tant que <strong>{user.email}</strong>
          {user.user_metadata?.name && ` (${user.user_metadata.name})`}
        </p>
      </div>
      <button
        onClick={onSignOut}
        style={{
          padding: '10px 20px',
          background: '#f44336',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: '500',
        }}
      >
        Déconnexion
      </button>
    </div>
  );
}
