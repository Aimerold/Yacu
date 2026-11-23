
import Avatar from '@/components/ui/Avatar';

import {
  getCallWithParticipant,
  markCallMissed,
  updateCallStatus,
} from '@/services/call.service';

import { supabase } from '@/lib/supabase';
import { getLiveKitConnection } from '@/services/livekit.service';
import { colors } from '@/theme/tokens';

import { Ionicons } from '@expo/vector-icons';

import {
  AudioSession,
  registerGlobals,
} from '@livekit/react-native';

import { requestRecordingPermissionsAsync } from 'expo-audio';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { Room, RoomEvent } from 'livekit-client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// Enregistrement des API WebRTC LiveKit
registerGlobals();

const CALL_TIMEOUT_MS = 45 * 1000;

export default function CallScreen() {
  const router = useRouter();

  const { callId, conversationId } = useLocalSearchParams<{
    callId: string;
    conversationId: string;
  }>();

  const [ending, setEnding] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  const [participantName, setParticipantName] = useState('Appel');
  const [participantAvatar, setParticipantAvatar] =
    useState<string | null>(null);

  const [callDuration, setCallDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [callStatus, setCallStatus] = useState<string | null>(null);

  // Une seule Room LiveKit pendant la durée de vie du composant
  const room = useMemo(() => new Room(), []);

  // Protection contre les doubles navigations
  const hasNavigatedRef = useRef(false);

  // État de la session audio
  const audioSessionStartedRef = useRef(false);

  // État du composant
  const mountedRef = useRef(true);

  // Indique une déconnexion volontaire
  const isLeavingRef = useRef(false);

  /**
   * Retourner à l'écran précédent une seule fois.
   */
  const exitScreen = useCallback(() => {
    if (hasNavigatedRef.current) return;

    hasNavigatedRef.current = true;

    if (router.canGoBack()) {
      router.back();
    }
  }, [router]);

  /**
   * Connecter l'utilisateur à l'appel LiveKit.
   */
  const startCall = useCallback(async () => {
    if (!callId || !conversationId) return;

    try {
      setConnecting(true);
      setError('');

      // 1. Vérifier que l'appel existe et récupérer le participant
      const { call, participant } =
        await getCallWithParticipant(callId);

      if (!mountedRef.current) return;

      setParticipantName(participant.fullName || 'Appel');
      setParticipantAvatar(participant.avatarUrl);
      setCallStatus(call.status);

      // 2. Vérifier le statut de l'appel
      if (
        call.status !== 'ringing' &&
        call.status !== 'accepted'
      ) {
        throw new Error('Cet appel n’est plus actif.');
      }

      // 3. Demander la permission microphone
      const permission =
        await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        throw new Error(
          'Permission microphone refusée. Autorisez le microphone pour appeler.'
        );
      }

      if (!mountedRef.current) return;

      // 4. Récupérer les informations de connexion LiveKit
      const connection = await getLiveKitConnection(
        callId,
        conversationId
      );

      if (!mountedRef.current) return;

      // 5. Démarrer la session audio AVANT room.connect()
      await AudioSession.startAudioSession();

      audioSessionStartedRef.current = true;

      if (!mountedRef.current) {
        await AudioSession.stopAudioSession();
        audioSessionStartedRef.current = false;
        return;
      }

      // 6. Connecter la Room LiveKit
      await room.connect(
        connection.url,
        connection.token
      );

      if (!mountedRef.current) {
        await room.disconnect();
        return;
      }

      // 7. Activer le microphone et publier la piste audio
      await room.localParticipant.setMicrophoneEnabled(true);

      if (!mountedRef.current) {
        await room.disconnect();
        return;
      }

      setMuted(false);
      setConnected(true);

    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : 'Impossible de rejoindre l’appel.';

      if (mountedRef.current) {
        setError(message);
      }

      // Nettoyer une éventuelle connexion partielle
      try {
        if (room.state !== 'disconnected') {
          await room.disconnect();
        }
      } catch {
        // Ignorer les erreurs de déconnexion
      }

      if (audioSessionStartedRef.current) {
        try {
          await AudioSession.stopAudioSession();
          audioSessionStartedRef.current = false;
        } catch {
          // Ignorer les erreurs de nettoyage audio
        }
      }

    } finally {
      if (mountedRef.current) {
        setConnecting(false);
      }
    }
  }, [callId, conversationId, room]);

  /**
   * Démarrer la connexion à l'ouverture de l'écran.
   */
  useEffect(() => {
    void startCall();
  }, [startCall]);

  /**
   * Gestion de la déconnexion LiveKit.
   */
  useEffect(() => {
    const handleDisconnected = () => {
      setConnected(false);
      setMuted(false);

      if (isLeavingRef.current) {
        exitScreen();
      } else if (mountedRef.current) {
        setError('La connexion à l’appel a été interrompue.');
      }
    };

    room.on(
      RoomEvent.Disconnected,
      handleDisconnected
    );

    return () => {
      room.off(
        RoomEvent.Disconnected,
        handleDisconnected
      );
    };
  }, [room, exitScreen]);

  /**
   * Écouter les changements de statut de l'appel dans Supabase.
   */
  useEffect(() => {
    if (!callId) return;

    const channel = supabase
      .channel(`call-status:${callId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `id=eq.${callId}`,
        },
        (payload) => {
          const updatedCall = payload.new as {
            status: string;
          };

          setCallStatus(updatedCall.status);

          if (
            updatedCall.status === 'declined' ||
            updatedCall.status === 'cancelled' ||
            updatedCall.status === 'missed' ||
            updatedCall.status === 'ended' ||
            updatedCall.status === 'failed'
          ) {
            isLeavingRef.current = true;

            void room.disconnect();

            exitScreen();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [callId, room, exitScreen]);

  /**
   * Gestion du délai maximal de sonnerie.
   * Le délai s'applique uniquement aux appels en attente.
   */
  useEffect(() => {
    if (
      !callId ||
      connected ||
      error ||
      callStatus !== 'ringing'
    ) {
      return;
    }

    const timer = setTimeout(() => {
      void markCallMissed(callId)
        .then(() => {
          isLeavingRef.current = true;

          void room.disconnect();

          exitScreen();
        })
        .catch(() => {
          if (mountedRef.current) {
            setError(
              'Impossible de terminer le délai de sonnerie.'
            );
          }
        });
    }, CALL_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [
    callId,
    callStatus,
    connected,
    error,
    room,
    exitScreen,
  ]);

  /**
   * Compteur de durée de l'appel.
   */
  useEffect(() => {
    if (!connected) return;

    const timer = setInterval(() => {
      setCallDuration((value) => value + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [connected]);

  /**
   * Activer ou désactiver le microphone.
   */
  const toggleMute = useCallback(async () => {
    if (!connected || ending) return;

    const nextMuted = !muted;

    try {
      await room.localParticipant.setMicrophoneEnabled(
        !nextMuted
      );

      setMuted(nextMuted);

    } catch {
      setError(
        'Impossible de modifier le microphone.'
      );
    }
  }, [connected, ending, muted, room]);

  /**
   * Terminer l'appel.
   */
  const endCall = useCallback(async () => {
    if (!callId || ending) return;

    try {
      setEnding(true);

      await updateCallStatus(
        callId,
        connected ? 'ended' : 'cancelled'
      );

      isLeavingRef.current = true;

      await room.disconnect();

      exitScreen();

    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Impossible de terminer l'appel.";

      setError(message);

    } finally {
      if (mountedRef.current) {
        setEnding(false);
      }
    }
  }, [
    callId,
    connected,
    ending,
    room,
    exitScreen,
  ]);

  /**
   * Nettoyage à la fermeture de l'écran.
   */
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      isLeavingRef.current = true;
      hasNavigatedRef.current = true;

      void (async () => {
        try {
          if (room.state !== 'disconnected') {
            await room.disconnect();
          }
        } catch {
          // Ignorer les erreurs de déconnexion
        }

        if (audioSessionStartedRef.current) {
          try {
            await AudioSession.stopAudioSession();

            audioSessionStartedRef.current = false;
          } catch {
            // Ignorer les erreurs de nettoyage audio
          }
        }
      })();
    };
  }, [room]);

  /**
   * Vérifier l'identifiant de l'appel.
   */
  useEffect(() => {
    if (!callId || !conversationId) {
      exitScreen();
    }
  }, [callId, conversationId, exitScreen]);

  /**
   * Formater la durée de l'appel.
   */
  function formatDuration(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${remainingSeconds
      .toString()
      .padStart(2, '0')}`;
  }

  return (
    <View style={styles.container}>
      <View style={styles.center}>

        <Avatar
          name={participantName}
          uri={participantAvatar}
          size={96}
        />

        <Text style={styles.title}>
          {participantName}
        </Text>

        {connecting ? (
          <>
            <Text style={styles.subtitle}>
              Connexion à l’appel…
            </Text>

            <ActivityIndicator
              color={colors.accent}
              size="large"
            />
          </>
        ) : error ? (
          <Text style={styles.error}>
            {error}
          </Text>
        ) : connected ? (
          <Text style={styles.subtitle}>
            Appel connecté • {formatDuration(callDuration)}
          </Text>
        ) : (
          <Text style={styles.subtitle}>
            Sonnerie…
          </Text>
        )}

        {/* Commandes de l'appel */}
        <View style={styles.actions}>

          {/* Bouton microphone */}
          <Pressable
            style={[
              styles.controlButton,
              muted && styles.controlButtonActive,
              (!connected || ending) && styles.disabledButton,
            ]}
            onPress={toggleMute}
            disabled={!connected || ending}
            accessibilityRole="button"
            accessibilityLabel={
              muted
                ? 'Activer le microphone'
                : 'Désactiver le microphone'
            }
          >
            <Ionicons
              name={muted ? 'mic-off' : 'mic'}
              size={26}
              color="#FFFFFF"
            />
          </Pressable>

          {/* Bouton terminer l'appel */}
          <Pressable
            style={styles.endButton}
            onPress={endCall}
            disabled={ending}
            accessibilityRole="button"
            accessibilityLabel="Terminer l'appel"
          >
            {ending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Ionicons
                name="close"
                size={30}
                color="#FFFFFF"
              />
            )}
          </Pressable>

        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#081426',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingHorizontal: 30,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },

  subtitle: {
    color: '#A8B6C8',
    fontSize: 16,
    textAlign: 'center',
  },

  error: {
    color: '#FF8A32',
    fontSize: 14,
    textAlign: 'center',
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginTop: 40,
  },

  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1E3A5F',
    alignItems: 'center',
    justifyContent: 'center',
  },

  controlButtonActive: {
    backgroundColor: '#EF4444',
  },

  disabledButton: {
    opacity: 0.45,
  },

  endButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
