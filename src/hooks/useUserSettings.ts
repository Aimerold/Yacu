import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentUserId } from '@/services/conversation.service';
import {
  ensureUserSettings,
  updateUserSettings,
} from '@/services/user-settings.service';
import type {
  UserSettings,
  UserSettingsPatch,
} from '@/services/user-settings.service';

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const settingsRef = useRef<UserSettings | null>(null);
  const userIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const apply = useCallback((next: UserSettings | null) => {
    settingsRef.current = next;
    if (mountedRef.current) setSettings(next);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const userId = await getCurrentUserId();
      userIdRef.current = userId;
      apply(await ensureUserSettings(userId));
    } catch {
      if (mountedRef.current) setError('Impossible de charger tes réglages.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Applique tout de suite le changement, puis l'enregistre ; annule en cas d'échec. */
  const update = useCallback(
    async (patch: UserSettingsPatch) => {
      const userId = userIdRef.current;
      const previous = settingsRef.current;

      if (!userId || !previous) return;

      apply({ ...previous, ...patch });
      if (mountedRef.current) setError('');

      try {
        const saved = await updateUserSettings(userId, patch);
        const current = settingsRef.current ?? previous;

        apply({ ...current, ...patch, updated_at: saved.updated_at });
      } catch {
        const rollback: Record<string, unknown> = {};

        for (const key of Object.keys(patch)) {
          rollback[key] = previous[key as keyof UserSettings];
        }

        apply({ ...(settingsRef.current ?? previous), ...rollback } as UserSettings);

        if (mountedRef.current) {
          setError('Impossible d’enregistrer ce réglage. Vérifie ta connexion.');
        }
      }
    },
    [apply]
  );

  return { settings, loading, error, update, reload };
}