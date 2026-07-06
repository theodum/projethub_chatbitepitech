import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Message } from '../types';

/**
 * S'abonne en temps réel aux nouveaux messages d'une conversation.
 * À chaque INSERT dans `messages` pour cette conversation, appelle `onInsert`
 * avec le message complet (auteur rechargé via jointure).
 *
 * Sert au partage : quand un autre membre (ou le bot) écrit, tous les
 * participants voient le message apparaître sans recharger la page.
 *
 * `onInsert` est appelé pour TOUS les inserts, y compris ceux de l'utilisateur
 * courant — c'est à l'appelant de dédupliquer (ex : ignorer un dbId déjà présent).
 */
export function useConversationRealtime(
  conversationId: string | null,
  onInsert: (message: Message) => void,
) {
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`conv:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const row = payload.new as Message;
          // Recharger l'auteur (le payload realtime ne contient pas la jointure users)
          let author = null;
          if (row.user_id) {
            const { data } = await supabase
              .from('users')
              .select('id, name, avatar_url')
              .eq('id', row.user_id)
              .maybeSingle();
            author = data;
          }
          onInsert({ ...row, author });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, onInsert]);
}
