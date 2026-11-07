import { supabase } from '@/lib/supabase';

export type ThemePreference = 'system' | 'light' | 'dark';

export type UserSettings = {
  user_id: string;
  show_last_seen: boolean;
  show_online_status: boolean;
  typing_indicator_enabled: boolean;
  read_receipts_enabled: boolean;
  push_notifications_enabled: boolean;
  theme_preference: ThemePreference;
  updated_at: string;
};

/** Champs modifiables par l'utilisateur. */
export type UserSettingsPatch = Partial<
  Omit<UserSettings, 'user_id' | 'updated_at'>
>;

const COLUMNS =
  'user_id, show_last_seen, show_online_status, typing_indicator_enabled, read_receipts_enabled, push_notifications_enabled, theme_preference, updated_at';

/** Réglages de l'utilisateur (null s'ils n'existent pas encore). */
export async function getUserSettings(
  userId: string
): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select(COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data as UserSettings | null) ?? null;
}

/** Retourne les réglages, en les créant avec les valeurs par défaut s'ils n'existent pas. */
export async function ensureUserSettings(userId: string): Promise<UserSettings> {
  const existing = await getUserSettings(userId);

  if (existing) return existing;

  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });

  if (error) throw new Error(error.message);

  const created = await getUserSettings(userId);

  if (!created) throw new Error('Réglages introuvables.');

  return created;
}

/** Modifie les réglages (la RLS n'autorise que les siens). */
export async function updateUserSettings(
  userId: string,
  patch: UserSettingsPatch
): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .update(patch)
    .eq('user_id', userId)
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);

  return data as UserSettings;
}