import { supabase } from '../lib/supabase';
import type { Message } from '../types';

/**
 * Récupérer tous les messages
 */
export async function getAllMessages(): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Erreur lors de la récupération des messages: ${error.message}`);
  }

  return data || [];
}

/**
 * Récupérer un message par ID
 */
export async function getMessageById(id: number): Promise<Message | null> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Message non trouvé
    }
    throw new Error(`Erreur lors de la récupération du message: ${error.message}`);
  }

  return data;
}

/**
 * Créer un nouveau message
 */
export async function createMessage(message: Omit<Message, 'id' | 'created_at'>): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert([message])
    .select()
    .single();

  if (error) {
    throw new Error(`Erreur lors de la création du message: ${error.message}`);
  }

  return data;
}

/**
 * Mettre à jour un message
 */
export async function updateMessage(
  id: number,
  updates: Partial<Omit<Message, 'id' | 'created_at'>>
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Erreur lors de la mise à jour du message: ${error.message}`);
  }

  if (!data) {
    throw new Error('Message non trouvé');
  }

  return data;
}

/**
 * Supprimer un message
 */
export async function deleteMessage(id: number): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Erreur lors de la suppression du message: ${error.message}`);
  }
}

/**
 * Enregistrer le feedback (👍/👎) de l'utilisateur sur un message du bot
 */
export async function updateMessageFeedback(id: number, feedback: 'up' | 'down'): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ feedback })
    .eq('id', id);

  if (error) {
    throw new Error(`Erreur lors de l'enregistrement du feedback: ${error.message}`);
  }
}
