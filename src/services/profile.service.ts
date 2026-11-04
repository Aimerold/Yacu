
import { supabase } from '@/lib/supabase';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  created_at: string;
  updated_at: string;
}

/**
 * Récupérer le profil de l'utilisateur connecté.
 */
export async function getMyProfile(): Promise<Profile> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('Utilisateur non connecté.');

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) throw error;

  return data as Profile;
}

/**
 * Récupérer un profil à partir de son identifiant.
 */
export async function getProfileById(
  userId: string
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;

  return data as Profile;
}

/**
 * Modifier le profil de l'utilisateur connecté.
 */
export async function updateMyProfile(
  updates: Partial<
    Pick<Profile, 'username' | 'display_name' | 'bio' | 'avatar_url'>
  >
): Promise<Profile> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('Utilisateur non connecté.');

  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('*')
    .single();

  if (error) throw error;

  return data as Profile;
}
