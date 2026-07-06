import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: SupabaseUser | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signInWithMicrosoft: () => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialisation des états
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        // 1. On récupère la session stockée (localStorage)
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        
        if (error) throw error;

        if (mounted) {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
        }
      } catch (error) {
        console.error("Erreur initAuth:", error);
        if (mounted) {
          setSession(null);
          setUser(null);
        }
      } finally {
        // 2. IMPORTANT : On arrête le chargement QUOI QU'IL ARRIVE
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initAuth();

    // 3. On écoute les changements futurs (connexion/déconnexion)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false); 

      // Logique de synchro DB (uniquement si connecté)
      if (session?.user && event === 'SIGNED_IN') {
        const provider = session.user.app_metadata?.provider || 'email';
        if (provider !== 'email') {
          handleUserSync(session, provider);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Fonction utilitaire pour synchroniser l'utilisateur dans la table 'users'
  const handleUserSync = async (session: Session, provider: string) => {
    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle();

      if (existingUser) {
        await supabase.from('users').update({
          email: session.user.email!,
          name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Utilisateur',
          auth_provider: provider,
          avatar_url: session.user.user_metadata?.avatar_url || null,
          updated_at: new Date().toISOString(),
        }).eq('id', session.user.id);
      } else {
        await supabase.from('users').insert({
          id: session.user.id,
          email: session.user.email!,
          name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Utilisateur',
          auth_provider: provider,
          avatar_url: session.user.user_metadata?.avatar_url || null,
          role: 'user',
        });
      }
    } catch (err) {
      console.error("Erreur Sync DB:", err);
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    if (!email.toLowerCase().endsWith('@epitech.eu')) {
      return { error: { message: 'L\'email doit se terminer par @epitech.eu' } };
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (!error && data.user) {
      await supabase.from('users').insert({
        id: data.user.id,
        email: data.user.email!,
        name: name,
        auth_provider: 'email',
        role: 'user',
      });
    }
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    if (!email.toLowerCase().endsWith('@epitech.eu')) {
      return { error: { message: 'L\'email doit se terminer par @epitech.eu' } };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    });
    return { error };
  };

  const signInWithMicrosoft = async () => {
    // Supabase expose Microsoft/Entra ID via le provider 'azure'.
    // Le scope 'email' est requis pour qu'Azure renvoie l'adresse email.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email openid profile',
        redirectTo: `${window.location.origin}/`,
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithMicrosoft,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
}