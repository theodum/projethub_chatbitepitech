import { supabase } from '../lib/supabase';

export interface DocumentItem {
  id: number;
  titre: string;
  source: string;
  created_at?: string;
  chunks: number;
  study_year?: number | null;   // 1..5 (tek1..tek5) ; null = toutes les promos
  start_date?: string | null;   // YYYY-MM-DD ; null = pas de restriction de date
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

/**
 * Met à jour les restrictions d'accès d'un document (promo + date de démarrage).
 * study_year : 1..5 ou null (toutes) · start_date : "YYYY-MM-DD" ou null.
 */
export async function updateDocumentAccess(
  id: number,
  access: { study_year: number | null; start_date: string | null }
): Promise<DocumentItem> {
  const res = await fetch(`/api/admin/documents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(access),
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
