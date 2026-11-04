
import { supabase } from '@/lib/supabase';
import type { Profile } from './profile.service';

/**
 * Rechercher des utilisateurs par username ou display_name.
 */
export async function searchUsers(
  searchTerm: string
): Promise<Profile[]> {
  const term = searchTerm.trim();

  if (term.length < 2) {
    return [];
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(20);

  if (error) throw error;

  return (data ?? []) as Profile[];
}
