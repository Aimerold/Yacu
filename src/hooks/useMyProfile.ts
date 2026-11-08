import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getMyProfile } from '@/services/profile.service';
import type { Profile } from '@/services/profile.service';

const listeners = new Set<() => void>();

/** À appeler après une modification du profil (photo…) : tous les écrans se rafraîchissent. */
export function invalidateMyProfile(): void {
  listeners.forEach((listener) => listener());
}

/** Profil de l'utilisateur connecté, rechargé quand l'écran reprend le focus. */
export function useMyProfile(): Profile | null {
  const [profile, setProfile] = useState<Profile | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await getMyProfile();

      if (mountedRef.current) setProfile(result);
    } catch {
      // On garde la valeur précédente : l'en-tête reste utilisable hors ligne.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  useEffect(() => {
    const listener = () => {
      void refresh();
    };

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, [refresh]);

  return profile;
}