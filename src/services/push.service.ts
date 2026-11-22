import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';




export async function registerPushToken(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();

  const userId = sessionData.session?.user.id;

  if (!userId) return;

  const settings = await Notifications.requestPermissionsAsync();

  if (!settings.granted) return;

  const tokenResponse = await Notifications.getExpoPushTokenAsync();

  const token = tokenResponse.data;

  if (!token) return;

  await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      },
      {
        onConflict: 'token',
      }
    );
}