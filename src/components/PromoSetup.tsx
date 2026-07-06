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
    <div className="min-h-screen flex items-center justify-center bg-ground p-6">
      <div className="w-full max-w-sm bg-surface border border-hairline-strong rounded-none">
        <div className="border-b border-hairline px-6 py-5">
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink-3 mb-1.5">
            Epibot // Profil
          </p>
          <h1 className="font-display text-xl font-semibold text-ink">Bienvenue</h1>
          <p className="text-sm text-ink-2 mt-1">
            Renseigne ton numéro de promo pour continuer.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
              Promo
            </label>
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
              className="w-full bg-surface-2 border border-hairline rounded-none px-3 py-2 text-ink placeholder:text-ink-3 outline-none focus:border-accent"
            />
          </div>
          {error && (
            <div className="border border-hairline bg-critical-soft text-critical rounded-none px-3 py-2 text-sm">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent on-accent rounded-none px-4 py-2.5 font-medium disabled:opacity-60"
          >
            {loading ? 'Enregistrement...' : 'Continuer'}
          </button>
        </form>
      </div>
    </div>
  );
}
