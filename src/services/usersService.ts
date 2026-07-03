import { supabase } from '../lib/supabase';
import type { User } from '../types';

/**
 * Récupérer tous les utilisateurs
 */
export async function getAllUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Erreur lors de la récupération des utilisateurs: ${error.message}`);
  }

  return data || [];
}

/**
 * Récupérer un utilisateur par ID
 */
export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Utilisateur non trouvé
    }
    throw new Error(`Erreur lors de la récupération de l'utilisateur: ${error.message}`);
  }

  return data;
}

/**
 * Créer un nouvel utilisateur
 */
export async function createUser(user: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .insert([user])
    .select()
    .single();

  if (error) {
    throw new Error(`Erreur lors de la création de l'utilisateur: ${error.message}`);
  }

  return data;
}

/**
 * Mettre à jour un utilisateur
 */
export async function updateUser(
  id: string,
  updates: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>
): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Erreur lors de la mise à jour de l'utilisateur: ${error.message}`);
  }

  if (!data) {
    throw new Error('Utilisateur non trouvé');
  }

  return data;
}

/**
 * Supprimer un utilisateur
 */
export async function deleteUser(id: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Erreur lors de la suppression de l'utilisateur: ${error.message}`);
  }
}
