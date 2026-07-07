import { useState } from 'react';
import { updateUser } from '../services/usersService';
import type { User } from '@supabase/supabase-js';

interface PromoSetupProps {
  user: User;
  onComplete: () => void;
}

export function PromoSetup({ user, onComplete }: PromoSetupProps) {
  const [year, setYear] = useState('');   // '1'..'5'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(year);
    if (!year || n < 1 || n > 5) {
      setError('Sélectionne ton année (tek1 à tek5).');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Le champ `promo` stocke désormais l'année d'étude (1..5).
      await updateUser(user.id, { promo: n });
      onComplete();
    } catch (err) {
      console.error('Erreur lors de la mise à jour du profil:', err);
      setError("Impossible d'enregistrer ton année. Réessaie.");
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
            Sélectionne ton année d'étude pour continuer.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
              Année d'étude
            </label>
            <select
              value={year}
              onChange={(e) => { setYear(e.target.value); if (error) setError(null); }}
              className="w-full bg-surface-2 border border-hairline rounded-none px-3 py-2 text-ink outline-none focus:border-accent font-mono"
            >
              <option value="">— Choisir —</option>
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={y}>tek{y}</option>
              ))}
            </select>
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
