import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type ConnectionStatus = 'checking' | 'connected' | 'error';

interface UseSupabaseConnectionReturn {
  status: ConnectionStatus;
  error: string | null;
  testConnection: () => Promise<void>;
}

/**
 * tester la connexion à Supabase
 */
export function useSupabaseConnection(): UseSupabaseConnectionReturn {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [error, setError] = useState<string | null>(null);

  const testConnection = async () => {
    try {
      setStatus('checking');
      setError(null);

      // Tester la connexion en faisant une requête simple
      const { error: connectionError } = await supabase
        .from('messages')
        .select('count')
        .limit(1);

      if (connectionError) {
        // Si l'erreur est liée à la table qui n'existe pas, c'est OK
        if (
          connectionError.message.includes('does not exist') ||
          connectionError.code === 'PGRST116' ||
          connectionError.code === '42P01' ||
          connectionError.message.includes('relation') ||
          connectionError.message.includes('table')
        ) {
          setStatus('connected');
          setError(
            '⚠️ Connexion OK, mais les tables n\'existent pas encore. Créez-les dans Supabase (voir SUPABASE_SETUP.md)'
          );
        } else if (
          connectionError.message.includes('JWT') ||
          connectionError.message.includes('Invalid API key')
        ) {
          setStatus('error');
          setError('❌ Clé API invalide. Vérifiez votre VITE_SUPABASE_ANON_KEY dans le fichier .env');
        } else {
          throw connectionError;
        }
      } else {
        setStatus('connected');
      }
    } catch (err: any) {
      setStatus('error');
      const errorMessage = err.message || err.toString() || 'Erreur inconnue';

      if (errorMessage.includes('Variables d\'environnement') || errorMessage.includes('VITE_SUPABASE')) {
        setError(
          '❌ Fichier .env manquant ou incomplet. Créez un fichier .env avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY'
        );
      } else if (errorMessage.includes('Invalid API key') || errorMessage.includes('JWT')) {
        setError('❌ Clé API invalide. Vérifiez votre VITE_SUPABASE_ANON_KEY dans le fichier .env');
      } else if (
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('Network') ||
        errorMessage.includes('fetch')
      ) {
        setError(
          '❌ Impossible de se connecter à Supabase. Vérifiez votre VITE_SUPABASE_URL dans le fichier .env et votre connexion internet'
        );
      } else {
        setError(`❌ Erreur de connexion: ${errorMessage}`);
      }
    }
  };

  useEffect(() => {
    testConnection();
  }, []);

  return { status, error, testConnection };
}
