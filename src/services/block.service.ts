import { supabase } from '@/lib/supabase';

export type BlockedUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

/** Indique si l'utilisateur connecté a bloqué cet utilisateur. */
export async function isUserBlocked(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocked_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return !!data;
}

/** Liste des utilisateurs bloqués par l'utilisateur connecté (les plus récents d'abord). */
export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const { data: rows, error } = await supabase
    .from('blocked_users')
    .select('blocked_id, created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const ids = ((rows ?? []) as { blocked_id: string }[]).map(
    (row) => row.blocked_id
  );

  if (ids.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', ids);

  if (profilesError) throw new Error(profilesError.message);

  const byId = new Map(
    ((profiles ?? []) as BlockedUser[]).map((profile) => [profile.id, profile])
  );

  // On conserve l'ordre de blocage ; un profil introuvable est ignoré.
  return ids
    .map((id) => byId.get(id))
    .filter((profile): profile is BlockedUser => !!profile);
}

/** Bloque un utilisateur (sans effet s'il est déjà bloqué). */
export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocked_id: userId });

  // 23505 : déjà bloqué
  if (error && error.code !== '23505') {
    console.error('blockUser a échoué :', error.code, error.message);
    throw new Error(error.message);
  }
}

/** Débloque un utilisateur. */
export async function unblockUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocked_id', userId);

  if (error) {
    console.error('unblockUser a échoué :', error.code, error.message);
    throw new Error(error.message);
  }
}