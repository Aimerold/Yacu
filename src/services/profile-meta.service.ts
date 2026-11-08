import { supabase } from '@/lib/supabase';

/** Date d'inscription d'un utilisateur (ISO), ou null si inconnue. */
export async function getMemberSince(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data as { created_at: string } | null)?.created_at ?? null;
}