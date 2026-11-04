import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getMyProfile } from '@/services/profile.service';
import type { Profile } from '@/services/profile.service';

/** Profil de l'utilisateur connecté, rechargé à chaque fois que l'écran reprend le focus. */
export function useMyProfile(): Profile | null {
  const [profile, setProfile] = useState<Profile | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      getMyProfile()
        .then((result) => {
          if (active) setProfile(result);
        })
        .catch(() => {
          // On garde la valeur précédente : l'en-tête reste utilisable hors ligne.
        });

      return () => {
        active = false;
      };
    }, [])
  );

  return profile;
}