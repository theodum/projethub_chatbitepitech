import { useEffect, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { ChatInterface } from './components/ChatInterface';
import { AdminPanel } from './components/AdminPanel';
import { useUserRole } from './hooks/useUserRole';
import { getUserById } from './services/usersService';
import { PromoSetup } from './components/PromoSetup';

/**
 * Composant principal de l'application
 */
function App() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [profileLoading, setProfileLoading] = useState(true);
  const [needsPromo, setNeedsPromo] = useState(false);

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      if (!user?.id) {
        if (active) {
          setNeedsPromo(false);
          setProfileLoading(false);
        }
        return;
      }
      try {
        const data = await getUserById(user.id);
        if (!active) return;
        setNeedsPromo(!data?.promo);
      } catch (error) {
        console.error('Erreur lors du chargement du profil:', error);
        if (active) {
          setNeedsPromo(false);
        }
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    };
    loadProfile();
    return () => {
      active = false;
    };
  }, [user?.id]);

  // Afficher le chargement pendant l'authentification
  if (authLoading || roleLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-sm text-ink-3">Chargement…</p>
      </div>
    );
  }

  // Afficher le formulaire d'authentification si l'utilisateur n'est pas connecté
  if (!user) {
    return <Auth />;
  }

  if (needsPromo) {
    return (
      <PromoSetup
        user={user}
        onComplete={() => {
          setNeedsPromo(false);
        }}
      />
    );
  }

  // Si l'utilisateur est admin, afficher directement le panneau d'administration
  if (isAdmin) {
    return <AdminPanel />;
  }

  // Sinon, afficher l'interface de chat pour les utilisateurs normaux
  return <ChatInterface />;
}

export default App;
