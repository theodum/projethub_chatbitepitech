import { supabase } from '../lib/supabase';
import type { AdminAlert } from '../types';

type AlertUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  dailyMessageCount: number;
};

export async function createUsageAlerts(users: AlertUser[], threshold = 25): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = users
    .filter((user) => user.id && user.dailyMessageCount > threshold)
    .map((user) => ({
      user_id: user.id,
      alert_date: today,
      type: 'usage',
      message: `${user.name || user.email || 'Utilisateur'} a depasse ${threshold} prompts aujourd'hui (${user.dailyMessageCount}).`,
    }));

  if (rows.length === 0) return;

  const { error } = await supabase
    .from('admin_notifications')
    .upsert(rows, { onConflict: 'user_id,alert_date,type' });

  if (error) {
    throw new Error(`Erreur lors de la création des alertes: ${error.message}`);
  }
}

export async function getRecentAlerts(limit = 5): Promise<AdminAlert[]> {
  const { data, error } = await supabase
    .from('admin_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Erreur lors de la récupération des alertes: ${error.message}`);
  }

  return data || [];
}
