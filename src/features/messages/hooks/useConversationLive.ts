import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { openConversationChannel } from '@/services/live.service';
import type { LiveChannel } from '@/services/live.service';
import { getPeerReceipts } from '@/services/receipt.service';
import type { PeerReceipts } from '@/services/receipt.service';

const PEER_TYPING_TTL_MS = 5000;
const TYPING_SEND_INTERVAL_MS = 3000;
const TYPING_IDLE_MS = 4000;
const RECEIPTS_POLL_MS = 30000;

type Timer = ReturnType<typeof setTimeout>;

type Params = {
  conversationId: string | undefined;
  /** Réglage « indicateur de saisie » : s'il est coupé, je n'envoie rien. */
  typingEnabled: boolean;
};

export function useConversationLive({ conversationId, typingEnabled }: Params) {
  const [peerTyping, setPeerTyping] = useState(false);
  const [receipts, setReceipts] = useState<PeerReceipts | null>(null);

  const channelRef = useRef<LiveChannel | null>(null);
  const peerTimerRef = useRef<Timer | null>(null);
  const stopTimerRef = useRef<Timer | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingEnabledRef = useRef(typingEnabled);
  typingEnabledRef.current = typingEnabled;

  const refreshReceipts = useCallback(async () => {
    if (!conversationId) return;

    try {
      setReceipts(await getPeerReceipts(conversationId));
    } catch {
      // Hors ligne : on garde l'état précédent, nouvelle tentative plus tard.
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;

    setPeerTyping(false);

    const channel = openConversationChannel(conversationId, {
      onTyping: (typing) => {
        if (peerTimerRef.current) clearTimeout(peerTimerRef.current);

        setPeerTyping(typing);

        // Sécurité : si « a arrêté d'écrire » se perd, l'indicateur expire seul.
        if (typing) {
          peerTimerRef.current = setTimeout(
            () => setPeerTyping(false),
            PEER_TYPING_TTL_MS
          );
        }
      },
      onReceipt: () => {
        void refreshReceipts();
      },
      onStatus: (status) => {
        if (status === 'SUBSCRIBED') void refreshReceipts();
      },
    });

    channelRef.current = channel;

    void refreshReceipts();

    const poll = setInterval(() => void refreshReceipts(), RECEIPTS_POLL_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshReceipts();
    });

    return () => {
      clearInterval(poll);
      appState.remove();

      if (peerTimerRef.current) clearTimeout(peerTimerRef.current);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);

      if (lastTypingSentRef.current !== 0) channel.sendTyping(false);

      lastTypingSentRef.current = 0;
      channel.close();
      channelRef.current = null;
    };
  }, [conversationId, refreshReceipts]);

  /** À appeler à chaque frappe : envoie « en train d'écrire » (au plus toutes les 3 s). */
  const notifyTyping = useCallback(() => {
    if (!typingEnabledRef.current) return;

    const channel = channelRef.current;

    if (!channel) return;

    const now = Date.now();

    if (now - lastTypingSentRef.current > TYPING_SEND_INTERVAL_MS) {
      lastTypingSentRef.current = now;
      channel.sendTyping(true);
    }

    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);

    stopTimerRef.current = setTimeout(() => {
      lastTypingSentRef.current = 0;
      channelRef.current?.sendTyping(false);
    }, TYPING_IDLE_MS);
  }, []);

  /** À appeler à l'envoi ou quand le champ est vidé. */
  const stopTyping = useCallback(() => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);

    if (lastTypingSentRef.current !== 0) {
      lastTypingSentRef.current = 0;
      channelRef.current?.sendTyping(false);
    }
  }, []);

  /** Prévient le correspondant que mon statut de lecture a changé. */
  const announceRead = useCallback(() => {
    channelRef.current?.sendReceipt();
  }, []);

  return { peerTyping, receipts, notifyTyping, stopTyping, announceRead };
}