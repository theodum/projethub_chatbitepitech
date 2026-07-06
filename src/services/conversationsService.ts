import { supabase } from '../lib/supabase';
import type { Conversation, ConversationMember, Message } from '../types';

/**
 * Liste les conversations dont l'utilisateur est membre (pas seulement propriétaire).
 * On part de `conversation_members` puis on joint `conversations`.
 */
export async function getUserConversations(userId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversation_members')
    .select('role, conversation:conversations(*)')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Erreur lors de la récupération des conversations: ${error.message}`);
  }

  type MemberRow = { role: string; conversation: Conversation | null };
  const rows = ((data || []) as unknown as MemberRow[])
    .map((row) => {
      const conv = row.conversation;
      if (!conv) return null;
      return { ...conv, is_owner: row.role === 'owner' } as Conversation;
    })
    .filter((c): c is Conversation => c !== null);

  // Tri par date de création décroissante (le plus récent en premier)
  rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return rows;
}

/**
 * Crée une conversation. Le créateur est inscrit comme membre 'owner'
 * automatiquement par un trigger DB (private.add_owner_on_conversation).
 */
export async function createConversation(userId: string, title: string): Promise<Conversation> {
  const { data, error } = await supabase
    .from('conversations')
    .insert([{ user_id: userId, title }])
    .select()
    .single();

  if (error) {
    throw new Error(`Erreur lors de la création de la conversation: ${error.message}`);
  }

  return { ...data, is_owner: true };
}

/**
 * Récupère les messages d'une conversation, avec l'auteur (name / avatar) joint
 * pour l'affichage en conversation partagée. Le bot a `user_id = null` -> author null.
 */
export async function getMessagesByConversation(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*, author:users(id, name, avatar_url)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Erreur lors de la récupération des messages: ${error.message}`);
  }

  return data || [];
}

/**
 * Membres d'une conversation, avec leur profil (name / avatar).
 */
export async function getConversationMembers(conversationId: string): Promise<ConversationMember[]> {
  const { data, error } = await supabase
    .from('conversation_members')
    .select('conversation_id, user_id, role, joined_at, user:users(id, name, avatar_url)')
    .eq('conversation_id', conversationId)
    .order('joined_at', { ascending: true });

  if (error) {
    throw new Error(`Erreur lors de la récupération des membres: ${error.message}`);
  }

  return (data as unknown as ConversationMember[]) || [];
}

/**
 * Ajoute un membre par email (RPC SECURITY DEFINER — réservé à l'owner, garde-fou @epitech.eu).
 */
export async function addMemberByEmail(conversationId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc('add_member_by_email', {
    conv_id: conversationId,
    member_email: email.trim(),
  });
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Retire un membre (owner) ou se retire soi-même ("quitter").
 */
export async function removeMember(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Erreur lors du retrait du membre: ${error.message}`);
  }
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const { error: messagesError } = await supabase
    .from('messages')
    .delete()
    .eq('conversation_id', conversationId);

  if (messagesError) {
    throw new Error(`Erreur lors de la suppression des messages: ${messagesError.message}`);
  }

  const { error: convoError } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId);

  if (convoError) {
    throw new Error(`Erreur lors de la suppression de la conversation: ${convoError.message}`);
  }
}
