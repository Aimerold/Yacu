import { supabase } from '@/lib/supabase';
import type { Profile } from '@/services/profile.service';

export const SEARCH_MIN_LENGTH = 2;

/**
 * Recherche d'utilisateurs par préfixe (nom d'utilisateur ou nom d'affichage).
 * Le serveur neutralise les jokers, exclut les utilisateurs bloqués dans les deux sens
 * et limite à 20 résultats. Seuls les champs publics du profil sont renvoyés.
 */
export async function searchUsers(term: string): Promise<Profile[]> {
  const clean = term.trim();

  if (clean.length < SEARCH_MIN_LENGTH) return [];

  const { data, error } = await supabase.rpc('search_users', { p_term: clean });

  if (error) throw new Error(error.message);

  return (data ?? []) as Profile[];
}