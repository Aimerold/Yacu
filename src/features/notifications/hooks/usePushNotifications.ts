import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useUserSettings } from '@/hooks/useUserSettings';
import {
  registerAndSavePushToken,
  savePushToken,
  unregisterStoredPushToken,
} from '@/lib/notifications';

const LAST_HANDLED_KEY = 'yacu.last_notification_response_id';

/**
 * À monter une seule fois dans la zone connectée.
 * - enregistre le jeton de l'appareil à chaque ouverture (si les notifications sont activées) ;
 * - le retire si l'utilisateur désactive les notifications ;
 * - ouvre la conversation concernée quand on touche une notification.
 */
export function usePushNotifications(): void {
  const router = useRouter();
  const { settings } = useUserSettings();
  const enabled = settings?.push_notifications_enabled;

  // Enregistre ou retire le jeton selon le réglage
  useEffect(() => {
  if (Platform.OS === 'android') {
    void registerAndSavePushToken();
    }
    }, []);

  // Si Android renouvelle le jeton, on le réenregistre
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
    async (response: Notifications.NotificationResponse | null | undefined) => {
      if (!response) return;

      const data = response.notification.request.content.data as
        | { conversationId?: unknown }
        | null
        | undefined;

      if (typeof data?.conversationId !== 'string') return;

      // Une même notification ne rouvre pas la conversation à chaque démarrage
      const id = response.notification.request.identifier;
      const last = await AsyncStorage.getItem(LAST_HANDLED_KEY).catch(() => null);

      if (last === id) return;

      await AsyncStorage.setItem(LAST_HANDLED_KEY, id).catch(() => undefined);

      router.push({
        pathname: '/chat/[conversationId]',
        params: { conversationId: data.conversationId },
      });
    },
    [router]
  );

  // Dernière notification touchée : couvre l'ouverture de l'app à froid et les touchers en cours d'utilisation.
  // La plateforme est constante : ce choix ne change jamais d'un rendu à l'autre.
  const lastResponse =
    Platform.OS === 'web' ? null : Notifications.useLastNotificationResponse();

  useEffect(() => {
    void openFromResponse(lastResponse);
  }, [lastResponse, openFromResponse]);
}