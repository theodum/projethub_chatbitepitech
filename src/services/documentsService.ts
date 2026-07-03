import { supabase } from '../lib/supabase';

export interface DocumentItem {
  id: number;
  titre: string;
  source: string;
  created_at?: string;
  chunks: number;
}

/**
 * Construit l'en-tête d'authentification avec le JWT de l'admin connecté.
 * Le backend vérifie ce token + le rôle admin avant d'agir.
 */
async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return body.detail || body.error || `Erreur ${res.status}`;
}

export async function listDocuments(): Promise<DocumentItem[]> {
  const res = await fetch('/api/admin/documents', { headers: await authHeader() });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function uploadDocument(file: File): Promise<DocumentItem> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/admin/documents', {
    method: 'POST',
    headers: await authHeader(), // pas de Content-Type : le navigateur gère le multipart
    body: form,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteDocument(id: number): Promise<void> {
  const res = await fetch(`/api/admin/documents/${id}`, {
    method: 'DELETE',
    headers: await authHeader(),
  });
  if (!res.ok) throw new Error(await parseError(res));
}
