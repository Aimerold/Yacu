
import { useUserSettings } from '@/hooks/useUserSettings';
import {
  registerAndSavePushToken,
  savePushToken,
} from '@/lib/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

const LAST_HANDLED_KEY = 'yacu.last_notification_response_id';

/**
 * À monter une seule fois dans la zone connectée.
 * - enregistre le jeton de l'appareil si les notifications sont activées ;
 * - ouvre la conversation concernée quand on touche une notification.
 */
export function usePushNotifications(): void {
  const router = useRouter();
  const { settings } = useUserSettings();
  const enabled = settings?.push_notifications_enabled;

  // Enregistre le jeton lorsque les notifications sont activées.
  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) {
      return;
    }

    void registerAndSavePushToken();
  }, [enabled]);

  // Si Android renouvelle le jeton, on le réenregistre.
  useEffect(() => {
    let subscription: ReturnType<
      typeof Notifications.addPushTokenListener
    > | null = null;

    if (Platform.OS === 'android' && enabled) {
      subscription = Notifications.addPushTokenListener((token) => {
        savePushToken('', token.data).catch(() => undefined);
      });
    }

    return () => {
      subscription?.remove();
    };
  }, [enabled]);

  const openFromResponse = useCallback(
    async (
      response:
        | Notifications.NotificationResponse
        | null
        | undefined
    ) => {
      if (!response) {
        return;
      }

      const data = response.notification.request.content.data as
        | { conversationId?: unknown }
        | null
        | undefined;

      if (typeof data?.conversationId !== 'string') {
        return;
      }

      // Une même notification ne rouvre pas la conversation à chaque démarrage.
      const id = response.notification.request.identifier;
      const last = await AsyncStorage.getItem(LAST_HANDLED_KEY).catch(
        () => null
      );

      if (last === id) {
        return;
      }

      await AsyncStorage.setItem(LAST_HANDLED_KEY, id).catch(
        () => undefined
      );

      router.push({
        pathname: '/chat/[conversationId]',
        params: { conversationId: data.conversationId },
      });
    },
    [router]
  );

  // Le Hook est appelé systématiquement, conformément aux règles React.
  const lastResponse = Notifications.useLastNotificationResponse();

  // Traite le toucher sur une notification.
  useEffect(() => {
    void openFromResponse(lastResponse);
  }, [lastResponse, openFromResponse]);
}
