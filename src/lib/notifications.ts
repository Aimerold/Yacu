import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { getActiveConversationId } from '@/lib/active-conversation';
import { supabase } from '@/lib/supabase';


/** Identifiant du canal Android : la fonction serveur d'envoi utilise la même valeur. */
export const ANDROID_MESSAGES_CHANNEL_ID = 'messages';


const TOKEN_STORAGE_KEY = 'yacu.expo_push_token';
const LOG_PREFIX = '[Yacu Notifications]';


function log(message: string, detail?: unknown): void {
  if (detail === undefined) {
    console.log(`${LOG_PREFIX} ${message}`);
  } else {
    console.log(`${LOG_PREFIX} ${message}`, detail);
  }
}


/** Masque le jeton dans les journaux : ExponentPushToken[abcd…] */
function maskToken(token: string): string {
  return token.length > 24 ? `${token.slice(0, 22)}…]` : token;
}


/**
 * Affichage des notifications lorsque Yacu est ouvert :
 * rien n'est montré pour la conversation déjà ouverte à l'écran.
 * Ignoré sur le Web : aucune notification n'y est gérée en V1.
 */
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      console.log(
        '[Yacu Notifications] Notification reçue :',
        notification.request.content.data
      );

      const data = notification.request.content.data as
        | { conversationId?: unknown }
        | null
        | undefined;


      const inOpenConversation =
        typeof data?.conversationId === 'string' &&
        data.conversationId === getActiveConversationId();


      return {
        shouldShowBanner: !inOpenConversation,
        shouldShowList: !inOpenConversation,
        shouldPlaySound: !inOpenConversation,
        shouldSetBadge: false,
      };
    },
  });
}


/**
 * Prépare l'appareil et récupère son Expo Push Token.
 *
 * Retourne null si l'utilisateur refuse les notifications ou si la plateforme
 * n'est pas Android. Lève une erreur si l'appareil n'est pas physique,
 * si le projectId EAS est absent ou si l'obtention du jeton échoue.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // V1 : notifications Android uniquement.
  if (Platform.OS !== 'android') {
    log('plateforme non prise en charge en V1 :', Platform.OS);
    return null;
  }


  log(`1/5 Android, appareil physique : ${Device.isDevice}`);


  // Les notifications push nécessitent un appareil physique.
  if (!Device.isDevice) {
    throw new Error('Les notifications push nécessitent un appareil physique.');
  }


  // Canal Android créé avant la demande de permission.
  // Pas de propriété `sound` : le son par défaut d'Android s'applique.
  await Notifications.setNotificationChannelAsync(ANDROID_MESSAGES_CHANNEL_ID, {
    name: 'Messages',
    description: 'Notifications des nouveaux messages Yacu',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF8A32',
  });
  log('2/5 canal Android prêt');


  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;


  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }


  log(`3/5 permission : ${finalStatus}`);


  if (finalStatus !== 'granted') {
    return null;
  }


  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;


  log(`4/5 projectId EAS : ${projectId ? 'présent' : 'ABSENT'}`);


  if (!projectId) {
    throw new Error(
      'EAS projectId introuvable : vérifie extra.eas.projectId dans app.json.'
    );
  }


  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });


    log(`5/5 jeton obtenu : ${maskToken(token.data)}`);


    // Mémorisé pour pouvoir le retirer à la déconnexion, même après un redémarrage.
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token.data).catch(
      () => undefined
    );


    return token.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);


    if (/firebase|fcm/i.test(message)) {
      log(
        'La configuration FCM manque dans ce build (google-services.json). ' +
          'Ajoute-la puis reconstruis le build de développement.'
      );
    }


    throw error;
  }
}


/**
 * Enregistre le token Expo Push pour l'utilisateur connecté.
 * Fonction serveur : l'identité vient de la session (le paramètre userId est
 * conservé pour compatibilité) et un jeton déjà lié à un autre compte
 * (appareil partagé) est réaffecté à l'utilisateur courant.
 */
export async function savePushToken(
  _userId: string,
  expoPushToken: string
): Promise<void> {
  const { error } = await supabase.rpc('register_device_token', {
    p_token: expoPushToken,
    p_platform: 'android',
  });


  if (error) {
    log('échec de register_device_token :', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message);
  }
}


export type PushRegistrationResult =
  | 'registered'
  | 'unsupported'
  | 'denied'
  | 'error';


/**
 * Obtient le jeton de l'appareil et l'enregistre en base.
 * Ne lève jamais d'erreur : chaque issue est journalisée.
 */
export async function registerAndSavePushToken(): Promise<PushRegistrationResult> {
  if (Platform.OS !== 'android') return 'unsupported';


  try {
    const token = await registerForPushNotificationsAsync();


    if (!token) {
      log('aucun jeton : permission refusée');
      return 'denied';
    }


    await savePushToken('', token);
    log(`jeton enregistré en base : ${maskToken(token)}`);


    return 'registered';
  } catch (error) {
    console.error(`${LOG_PREFIX} Enregistrement du token échoué :`, error);
    return 'error';
  }
}


/**
 * Supprime le token lors de la déconnexion.
 */
export async function deletePushToken(expoPushToken: string): Promise<void> {
  const { error } = await supabase
    .from('device_tokens')
    .delete()
    .eq('expo_push_token', expoPushToken);


  if (error) {
    throw new Error(error.message);
  }
}


/**
 * Retire de la base le jeton mémorisé sur cet appareil.
 * À appeler AVANT la fermeture de la session (la RLS exige d'être connecté).
 * Sans effet si aucun jeton n'est mémorisé ; ne lève jamais d'erreur.
 */
export async function unregisterStoredPushToken(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);


    if (!token) return;


    await deletePushToken(token);
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
    log('jeton retiré de la base');
  } catch {
    // Hors ligne : le jeton sera réaffecté au prochain compte qui se connecte ici.
  }
}


/**
 * Écoute les notifications reçues et les interactions
 * lorsque l'utilisateur clique sur une notification.
 */
export function addNotificationListeners(
  onReceived: (notification: Notifications.Notification) => void,
  onResponse: (response: Notifications.NotificationResponse) => void
) {
  // Rien à écouter sur le Web.
  if (Platform.OS === 'web') {
    return () => undefined;
  }


  const receivedSubscription =
    Notifications.addNotificationReceivedListener(onReceived);


  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener(onResponse);


  // Nettoyage des écouteurs.
  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

