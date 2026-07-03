import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUserById } from '../services/usersService';

/**
 * Hook pour récupérer le rôle de l'utilisateur connecté
 */
export function useUserRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<'user' | 'admin' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user?.id) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const userData = await getUserById(user.id);
        const userRole = userData?.role || 'user';
        console.log('Role utilisateur recupere:', userRole, 'Email:', userData?.email);
        setRole(userRole);
      } catch (error) {
        console.error('Erreur lors de la recuperation du role:', error);
        setRole('user');
      } finally {
        setLoading(false);
      }
    };

    fetchUserRole();
  }, [user?.id]);

  return { role, isAdmin: role === 'admin', loading };
}
