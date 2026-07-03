interface ConnectionStatusProps {
  status: 'checking' | 'connected' | 'error';
  error: string | null;
  onRetry: () => void;
}

/**
 * Composant pour afficher le statut de connexion à Supabase
 */
export function ConnectionStatus({ status, error, onRetry }: ConnectionStatusProps) {
  const getStatusStyles = () => {
    switch (status) {
      case 'connected':
        return {
          background: '#e8f5e9',
          color: '#2e7d32',
          border: '2px solid #4caf50',
        };
      case 'error':
        return {
          background: '#ffebee',
          color: '#c62828',
          border: '2px solid #f44336',
        };
      default:
        return {
          background: '#fff3e0',
          color: '#e65100',
          border: '2px solid #ff9800',
        };
    }
  };

  const styles = getStatusStyles();

  return (
    <div
      style={{
        padding: '15px',
        marginBottom: '20px',
        borderRadius: '4px',
        ...styles,
      }}
    >
      {status === 'checking' && (
        <div>
          <strong>🔄 Test de connexion en cours...</strong>
        </div>
      )}

      {status === 'connected' && (
        <div>
          <strong>✅ Connexion à Supabase réussie !</strong>
          {error && <div style={{ marginTop: '10px', fontSize: '0.9em' }}>{error}</div>}
          <button
            onClick={onRetry}
            style={{
              marginTop: '10px',
              padding: '6px 12px',
              background: '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            🔄 Tester à nouveau
          </button>
        </div>
      )}

      {status === 'error' && (
        <div>
          <strong>{error || '❌ Erreur de connexion'}</strong>
          <div style={{ marginTop: '10px', fontSize: '0.9em' }}>
            <p>
              <strong>Vérifiez :</strong>
            </p>
            <ul style={{ marginLeft: '20px' }}>
              <li>Le fichier <code>.env</code> existe à la racine du projet</li>
              <li>
                Les variables <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> sont
                définies
              </li>
              <li>Les valeurs sont correctes (sans guillemets, sans espaces)</li>
              <li>Vous avez redémarré le serveur après avoir créé/modifié le fichier .env</li>
            </ul>
          </div>
          <button
            onClick={onRetry}
            style={{
              marginTop: '10px',
              padding: '6px 12px',
              background: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            🔄 Réessayer
          </button>
        </div>
      )}
    </div>
  );
}
