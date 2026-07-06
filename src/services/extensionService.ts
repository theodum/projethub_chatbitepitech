import { supabase } from '../lib/supabase';

/**
 * Génère un token dédié à l'extension VS Code (long-lived, révocable),
 * lié à l'utilisateur courant. Appelle la RPC SECURITY DEFINER côté Supabase.
 */
export async function generateExtensionToken(label?: string): Promise<string> {
  const { data, error } = await supabase.rpc('generate_extension_token', {
    token_label: label ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
  return data as string;
}

/**
 * Un collage de code massif détecté par l'extension VS Code (modération).
 */
export interface PasteEvent {
  id: number;
  user_id: string | null;
  file_name: string | null;
  line_count: number;
  language: string | null;
  is_code: boolean;
  excerpt: string | null;
  created_at: string;
  user?: { name: string | null; email: string } | null;
}

/**
 * Liste les collages suspects (réservé admin par RLS). Joint le profil auteur.
 */
export async function getPasteEvents(limit = 50): Promise<PasteEvent[]> {
  const { data, error } = await supabase
    .from('code_paste_events')
    .select('*, user:users(name, email)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }
  return (data as unknown as PasteEvent[]) || [];
}
