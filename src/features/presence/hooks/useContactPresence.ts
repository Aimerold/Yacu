import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getPresence } from '@/services/presence.service';
import type { PresenceInfo } from '@/services/presence.service';

const REFRESH_MS = 20000;

/** Présence d'un contact, relue toutes les 20 s et au retour au premier plan. */
export function useContactPresence(
  userId: string | undefined
): PresenceInfo | null {
  const [presence, setPresence] = useState<PresenceInfo | null>(null);

  useEffect(() => {
    if (!userId) return;

    const id = userId;
    let active = true;

    async function refresh() {
      try {
        const map = await getPresence([id]);

        if (active) setPresence(map.get(id) ?? null);
      } catch {
        // Hors ligne : on garde le dernier état connu.
      }
    }

    void refresh();

    const timer = setInterval(() => void refresh(), REFRESH_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [userId]);

  return presence;
}