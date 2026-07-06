import { useEffect, useState } from 'react';
import { X, Copy, Check, UserPlus, Trash2, Crown } from 'lucide-react';
import type { ConversationMember } from '../types';
import {
  getConversationMembers,
  addMemberByEmail,
  removeMember,
} from '../services/conversationsService';
import { createInviteLink } from '../services/invitesService';

interface Props {
  conversationId: string;
  currentUserId: string;
  isOwner: boolean;
  onClose: () => void;
  onMembersChanged?: () => void;
}

export function ShareConversationModal({
  conversationId,
  currentUserId,
  isOwner,
  onClose,
  onMembersChanged,
}: Props) {
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadMembers = async () => {
    try {
      setMembers(await getConversationMembers(conversationId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const handleGenerateLink = async () => {
    setError(null);
    try {
      const link = await createInviteLink(conversationId, currentUserId);
      setInviteLink(link);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await addMemberByEmail(conversationId, email);
      setEmail('');
      await loadMembers();
      onMembersChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setError(null);
    try {
      await removeMember(conversationId, userId);
      await loadMembers();
      onMembersChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl shadow-2xl border border-hairline w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold text-ink">
            Partager la conversation
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-2 text-ink-3"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-3 text-sm text-critical bg-critical-soft rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {isOwner && (
          <>
            {/* Lien d'invitation */}
            <div className="mb-5">
              <p className="text-sm font-semibold text-ink-2 mb-2">
                Lien d'invitation
              </p>
              {inviteLink ? (
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    className="flex-1 bg-surface-2 border border-hairline rounded-lg px-3 py-2 text-xs font-mono text-ink-2 truncate"
                  />
                  <button
                    onClick={handleCopy}
                    className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-ink text-white flex items-center gap-1.5 text-sm font-medium"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? 'Copié' : 'Copier'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGenerateLink}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Générer un lien d'invitation
                </button>
              )}
              <p className="mt-1.5 text-xs text-ink-3">
                Toute personne connectée avec un compte @epitech.eu qui ouvre ce lien
                rejoint la conversation.
              </p>
            </div>

            {/* Ajout par email */}
            <form onSubmit={handleAddEmail} className="mb-5">
              <p className="text-sm font-semibold text-ink-2 mb-2">
                Ajouter par email
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom.nom@epitech.eu"
                  className="flex-1 bg-surface-2 border border-hairline focus:border-accent rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-3 outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || !email.trim()}
                  className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-ink disabled:opacity-50 text-white flex items-center gap-1.5 text-sm font-medium"
                >
                  <UserPlus size={16} />
                  Ajouter
                </button>
              </div>
            </form>
          </>
        )}

        {/* Liste des membres */}
        <div>
          <p className="text-sm font-semibold text-ink-2 mb-2">
            Participants ({members.length})
          </p>
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {members.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2"
              >
                <div
                  className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
                  style={{
                    background: m.user_id === currentUserId
                      ? 'var(--color-maize)'
                      : 'var(--color-positive)',
                  }}
                >
                  {m.user?.avatar_url ? (
                    <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (m.user?.name || '?').slice(0, 1).toUpperCase()
                  )}
                </div>
                <span className="flex-1 text-sm text-ink truncate">
                  {m.user?.name || 'Étudiant'}
                  {m.user_id === currentUserId && ' (vous)'}
                </span>
                {m.role === 'owner' ? (
                  <span title="Créateur" className="text-maize">
                    <Crown size={15} />
                  </span>
                ) : (
                  (isOwner || m.user_id === currentUserId) && (
                    <button
                      onClick={() => handleRemove(m.user_id)}
                      title={m.user_id === currentUserId ? 'Quitter' : 'Retirer'}
                      className="p-1 rounded-md hover:bg-critical-soft text-ink-3 hover:text-critical"
                    >
                      <Trash2 size={13} />
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
