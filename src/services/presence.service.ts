import { supabase } from '@/lib/supabase';

export type PresenceInfo = {
  isOnline: boolean;
  /** Dernière activité, seulement si les réglages des deux personnes l'autorisent. */
  lastSeenAt: string | null;
};

type PresenceRow = {
  target_id: string;
  is_online: boolean;
  last_seen_at: string | null;
};

/** Enregistre ma dernière activité (battement de cœur). */
export async function touchPresence(): Promise<void> {
  const { error } = await supabase.rpc('touch_presence');

  if (error) throw new Error(error.message);
}

/** Présence de plusieurs utilisateurs ; les personnes non visibles sont absentes du résultat. */
export async function getPresence(
  userIds: string[]
): Promise<Map<string, PresenceInfo>> {
  if (userIds.length === 0) return new Map();

  const { data, error } = await supabase.rpc('get_presence', {
    p_user_ids: userIds,
  });

  if (error) throw new Error(error.message);

  return new Map(
    ((data ?? []) as PresenceRow[]).map((row) => [
      row.target_id,
      { isOnline: row.is_online, lastSeenAt: row.last_seen_at },
    ])
  );
}