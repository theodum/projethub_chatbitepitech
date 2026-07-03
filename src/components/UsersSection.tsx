import { useState, useEffect } from 'react';
import type { User } from '../types';
import { getAllUsers, createUser, updateUser, deleteUser } from '../services/usersService';

interface UsersSectionProps {
  connectionStatus: 'checking' | 'connected' | 'error';
}

/**
 * Composant pour gérer les utilisateurs
 */
export function UsersSection({ connectionStatus }: UsersSectionProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  const loadUsers = async () => {
    if (connectionStatus !== 'connected') return;

    try {
      setLoading(true);
      setError(null);
      const data = await getAllUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!userName.trim() || !userEmail.trim()) return;

    try {
      setError(null);
      const newUser = await createUser({
        name: userName,
        email: userEmail,
      });
      setUsers([newUser, ...users]);
      setUserName('');
      setUserEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    }
  };

  const handleUpdateUser = async (id: string, updates: Partial<User>) => {
    try {
      setError(null);
      const updated = await updateUser(id, updates);
      setUsers(users.map((u) => (u.id === id ? updated : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      setError(null);
      await deleteUser(id);
      setUsers(users.filter((u) => u.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    }
  };

  // Charger les utilisateurs quand la connexion est établie
  useEffect(() => {
    if (connectionStatus === 'connected') {
      loadUsers();
    }
  }, [connectionStatus]);

  return (
    <section>
      <h2>Utilisateurs</h2>

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
          placeholder="Nom"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          style={{ flex: 1, padding: '8px' }}
        />
        <input
          type="email"
          placeholder="Email"
          value={userEmail}
          onChange={(e) => setUserEmail(e.target.value)}
          style={{ flex: 1, padding: '8px' }}
        />
        <button onClick={handleCreateUser} style={{ padding: '8px 16px' }}>
          Ajouter
        </button>
      </div>

      {loading ? (
        <p>Chargement...</p>
      ) : (
        <div>
          {users.length === 0 ? (
            <p>Aucun utilisateur</p>
          ) : (
            users.map((user) => (
              <div
                key={user.id}
                style={{
                  padding: '10px',
                  marginBottom: '10px',
                  background: '#e3f2fd',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong>{user.name || 'Sans nom'}</strong> - {user.email}
                  {user.auth_provider && (
                    <small style={{ display: 'block', color: '#666' }}>
                      Connecté via {user.auth_provider}
                    </small>
                  )}
                  {user.created_at && (
                    <small style={{ display: 'block', color: '#666' }}>
                      Créé le {new Date(user.created_at).toLocaleString()}
                    </small>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => {
                      const newName = prompt('Nouveau nom:', user.name || '');
                      const newEmail = prompt('Nouvel email:', user.email);
                      if (newName !== null && newEmail) {
                        handleUpdateUser(user.id!, { name: newName, email: newEmail });
                      }
                    }}
                    style={{ padding: '4px 8px' }}
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Supprimer cet utilisateur?')) {
                        handleDeleteUser(user.id!);
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
