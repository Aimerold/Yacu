import { supabase } from '@/lib/supabase';

export type LiveChannel = {
  sendTyping: (typing: boolean) => void;
  sendReceipt: () => void;
  close: () => void;
};

/**
 * Ouvre le canal privé « conversation:<id> » (autorisé par RLS : membres uniquement).
 * Les événements sont éphémères et ne sont jamais stockés ; ce sont des indices
 * d'affichage, la vérité sur les reçus reste la fonction serveur.
 */
export function openConversationChannel(
  conversationId: string,
  handlers: {
    onTyping: (typing: boolean) => void;
    onReceipt: () => void;
    onStatus: (status: string) => void;
  }
): LiveChannel {
  let subscribed = false;

  const channel = supabase
    .channel(`conversation:${conversationId}`, { config: { private: true } })
    .on('broadcast', { event: 'typing' }, (message) => {
      const payload = message.payload as { typing?: boolean } | undefined;
      handlers.onTyping(!!payload?.typing);
    })
    .on('broadcast', { event: 'receipt' }, () => handlers.onReceipt())
    .subscribe((status) => {
      subscribed = status === 'SUBSCRIBED';
      handlers.onStatus(status);
    });

  function send(event: string, payload: Record<string, unknown>) {
    if (!subscribed) return;

    void channel.send({ type: 'broadcast', event, payload });
  }

  return {
    sendTyping: (typing) => send('typing', { typing }),
    sendReceipt: () => send('receipt', {}),
    close: () => {
      subscribed = false;
      void supabase.removeChannel(channel);
    },
  };
}