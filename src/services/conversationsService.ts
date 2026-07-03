import { supabase } from '../lib/supabase';
import type { Conversation, Message } from '../types';

export async function getUserConversations(userId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Erreur lors de la récupération des conversations: ${error.message}`);
  }

  return data || [];
}

export async function createConversation(userId: string, title: string): Promise<Conversation> {
  const { data, error } = await supabase
    .from('conversations')
    .insert([{ user_id: userId, title }])
    .select()
    .single();

  if (error) {
    throw new Error(`Erreur lors de la création de la conversation: ${error.message}`);
  }

  return data;
}

export async function getMessagesByConversation(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Erreur lors de la récupération des messages: ${error.message}`);
  }

  return data || [];
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
