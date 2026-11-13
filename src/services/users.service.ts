import { supabase } from '@/lib/supabase';
import type { Profile } from '@/services/profile.service';

const SEARCH_LIMIT = 20;

/**
 * Échappe les caractères spéciaux utilisés par le filtre ILIKE.
 * Sans cela, "%" et "_" peuvent modifier la recherche.
 */
function escapeSearchTerm(term: string): string {
  return term
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * Recherche des utilisateurs dont le nom d'utilisateur ou le nom
 * d'affichage contient le terme saisi.
 *
 * Les utilisateurs bloqués, dans les deux sens, sont exclus.
 */
export async function searchUsers(
  searchTerm: string
): Promise<Profile[]> {
  const rawTerm = searchTerm.trim().toLowerCase();

  if (rawTerm.length < 2) {
    return [];
  }

  const safeTerm = escapeSearchTerm(rawTerm);
  const contains = `%${safeTerm}%`;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('Utilisateur non connecté.');

  const { data: blockedRows, error: blockedError } = await supabase
    .from('blocked_users')
    .select('blocker_id, blocked_id')
    .or(
      `blocker_id.eq.${user.id},blocked_id.eq.${user.id}`
    );

  if (blockedError) throw blockedError;

  const blockedIds = (blockedRows ?? []).map((row) =>
    row.blocker_id === user.id ? row.blocked_id : row.blocker_id
  );

  let query = supabase
    .from('profiles')
    .select('*')
    .or(
      `username.ilike.${contains},display_name.ilike.${contains}`
    )
    .neq('id', user.id)
    .limit(SEARCH_LIMIT);

  if (blockedIds.length > 0) {
    query = query.not('id', 'in', `(${blockedIds.join(',')})`);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []) as Profile[];
}

