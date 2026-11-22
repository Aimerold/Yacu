
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '@/components/ui/Avatar';
import { colors } from '@/theme/tokens';
import { Room, RoomEvent } from 'livekit-client';
import { registerGlobals } from '@livekit/react-native';

import {
  getCallWithParticipant,
  markCallMissed,
  updateCallStatus,
} from '@/services/call.service';

import { getLiveKitConnection } from '@/services/livekit.service';
import { supabase } from '@/lib/supabase';

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

  const room = useMemo(() => new Room(), []);

  /**
   * Connecte l'utilisateur à l'appel LiveKit.
   */
  const startCall = useCallback(async () => {
    if (!callId || !conversationId) return;

    try {
      setConnecting(true);
      setError('');

      const { call, participant } =
        await getCallWithParticipant(callId);

      setParticipantName(participant.fullName || 'Appel');
      setParticipantAvatar(participant.avatarUrl);

      if (
        call.status !== 'ringing' &&
        call.status !== 'accepted'
      ) {
        throw new Error('Cet appel n’est plus actif.');
      }

      const connection = await getLiveKitConnection(
        callId,
        conversationId
      );

      await room.connect(connection.url, connection.token);

      setConnected(true);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : 'Impossible de rejoindre l’appel.';

      setError(message);
    } finally {
      setConnecting(false);
    }
  }, [callId, conversationId, room]);

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
      router.back();
    };

    room.on(RoomEvent.Disconnected, handleDisconnected);

    return () => {
      room.off(RoomEvent.Disconnected, handleDisconnected);
    };
  }, [room, router]);

  /**
   * Écoute les changements de statut de l'appel.
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
          const call = payload.new as { status: string };

          if (
            call.status === 'declined' ||
            call.status === 'cancelled' ||
            call.status === 'missed' ||
            call.status === 'ended'
          ) {
            room.disconnect();
            router.back();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [callId, room, router]);

  /**
   * Gestion du délai maximal de sonnerie.
   */
  useEffect(() => {
    if (!callId || connected || error) return;

    const timer = setTimeout(() => {
      void markCallMissed(callId)
        .then(() => {
          room.disconnect();
          router.back();
        })
        .catch(() => undefined);
    }, CALL_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [callId, connected, error, room, router]);

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
   * Active ou désactive le microphone.
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
      setError('Impossible de modifier le microphone.');
    }
  }, [connected, ending, muted, room]);

  /**
   * Termine l'appel.
   */
  const endCall = useCallback(async () => {
    if (!callId || ending) return;

    try {
      setEnding(true);

      await updateCallStatus(
        callId,
        connected ? 'ended' : 'cancelled'
      );

      room.disconnect();
      router.back();
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Impossible de terminer l'appel.";

      setError(message);
    } finally {
      setEnding(false);
    }
  }, [callId, connected, ending, room, router]);

  /**
   * Nettoyage à la fermeture de l'écran.
   */
  useEffect(() => {
    return () => {
      if (room.state !== 'disconnected') {
        room.disconnect();
      }
    };
  }, [room]);

  /**
   * Vérification de l'identifiant de l'appel.
   */
  useEffect(() => {
    if (!callId) {
      router.back();
    }
  }, [callId, router]);

  /**
   * Formate la durée de l'appel.
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
              muted ? 'Activer le microphone' : 'Désactiver le microphone'
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
