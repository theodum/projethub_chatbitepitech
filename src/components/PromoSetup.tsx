import { useState } from 'react';
import { updateUser } from '../services/usersService';
import type { User } from '@supabase/supabase-js';

interface PromoSetupProps {
  user: User;
  onComplete: () => void;
}

export function PromoSetup({ user, onComplete }: PromoSetupProps) {
  const [promo, setPromo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promo.trim();
    if (!/^20\d{2}$/.test(trimmed)) {
      setError('Format invalide. Exemple : 2029');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await updateUser(user.id, { promo: Number(trimmed) });
      onComplete();
    } catch (err) {
      console.error('Erreur lors de la mise à jour du profil:', err);
      setError("Impossible d'enregistrer la promo. Réessaie.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Bienvenue</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
          Renseigne ton numéro de promo pour continuer.
        </p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Ex: 2029"
            value={promo}
            maxLength={4}
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 4);
              setPromo(digitsOnly);
              if (error) setError(null);
            }}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-3 transition-colors"
          >
            {loading ? 'Enregistrement...' : 'Continuer'}
          </button>
        </form>
      </div>
    </div>
  );
}
