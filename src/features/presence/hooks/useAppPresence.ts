import { useEffect } from 'react';
import { AppState } from 'react-native';
import { touchPresence } from '@/services/presence.service';
import { markAllDelivered } from '@/services/receipt.service';
import { subscribeToMyMessages } from '@/services/message.service';

const HEARTBEAT_MS = 25000;
const DELIVERY_DEBOUNCE_MS = 500;

/**
 * À monter une seule fois dans la zone connectée.
 * - Au premier plan : « je suis actif » toutes les 25 s ; une dernière fois en quittant.
 * - Au lancement, au retour au premier plan et à chaque message reçu : « reçu ».
 */
export function useAppPresence(): void {
  useEffect(() => {
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let deliveryTimer: ReturnType<typeof setTimeout> | null = null;

    const beat = () => {
      touchPresence().catch(() => undefined);
    };

    const markDelivered = () => {
      markAllDelivered().catch(() => undefined);
    };

    const start = () => {
      if (heartbeat) return;

      beat();
      markDelivered();
      heartbeat = setInterval(beat, HEARTBEAT_MS);
    };

    const stop = () => {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    };

    if (AppState.currentState === 'active') start();

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        start();
      } else {
        beat();
        stop();
      }
    });

    const unsubscribeMessages = subscribeToMyMessages(() => {
      if (deliveryTimer) clearTimeout(deliveryTimer);
      deliveryTimer = setTimeout(markDelivered, DELIVERY_DEBOUNCE_MS);
    });

    return () => {
      stop();
      if (deliveryTimer) clearTimeout(deliveryTimer);
      appState.remove();
      unsubscribeMessages();
    };
  }, []);
}