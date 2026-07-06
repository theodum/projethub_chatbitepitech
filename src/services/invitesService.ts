import { supabase } from '../lib/supabase';

/**
 * Crée (ou renvoie) un lien d'invitation pour une conversation.
 * Réservé à l'owner (policy ci_insert). Retourne l'URL complète à partager.
 */
export async function createInviteLink(conversationId: string, createdBy: string): Promise<string> {
  // Réutilise une invitation existante si présente (évite d'en accumuler).
  const { data: existing } = await supabase
    .from('conversation_invites')
    .select('token')
    .eq('conversation_id', conversationId)
    .limit(1)
    .maybeSingle();

  let token = existing?.token as string | undefined;

  if (!token) {
    const { data, error } = await supabase
      .from('conversation_invites')
      .insert([{ conversation_id: conversationId, created_by: createdBy }])
      .select('token')
      .single();
    if (error) {
      throw new Error(`Erreur lors de la création du lien: ${error.message}`);
    }
    token = data.token;
  }

  return `${window.location.origin}/?invite=${token}`;
}

/**
 * Accepte une invitation via son token (RPC SECURITY DEFINER, garde-fou @epitech.eu).
 * Retourne l'id de la conversation rejointe.
 */
export async function acceptInvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_invite', { invite_token: token });
  if (error) {
    throw new Error(error.message);
  }
  return data as string;
}
