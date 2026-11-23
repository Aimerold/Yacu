import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';



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


export function configurePushNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as
      | {
          type?: string;
          callId?: string;
          conversationId?: string;
        }
      | undefined;

    if (
      data?.type === 'incoming_call' &&
      typeof data.callId === 'string' &&
      typeof data.conversationId === 'string'
    ) {
      router.push({
        pathname: '/call/[callId]',
        params: {
          callId: data.callId,
          conversationId: data.conversationId,
        },
      });
    }
  });
}