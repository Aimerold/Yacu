import { useCallback, useEffect, useState } from 'react';
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
import { RoomEvent } from 'livekit-client';
import {
  registerGlobals,
  useRoom,
} from '@livekit/react-native';
import {
  getCallById,
  updateCallStatus,
} from '@/services/call.service';
import { getLiveKitConnection } from '@/services/livekit.service';

registerGlobals();

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

  const { room, connect } = useRoom();

  const startCall = useCallback(async () => {
    if (!callId || !conversationId) return;

    try {
      setConnecting(true);
      setError('');

      const call = await getCallById(callId);

      if (!call) {
        throw new Error('Appel introuvable.');
      }

      if (call.status !== 'ringing' && call.status !== 'accepted') {
        throw new Error('Cet appel n’est plus actif.');
      }

      const connection = await getLiveKitConnection(
        callId,
        conversationId
      );

      await connect(connection.url, connection.token);

      setConnected(true);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Impossible de rejoindre l’appel.';

      setError(message);
    } finally {
      setConnecting(false);
    }
  }, [callId, conversationId, connect]);

  useEffect(() => {
    void startCall();
  }, [startCall]);

  useEffect(() => {
    if (!room) return;

    const handleDisconnected = () => {
      setConnected(false);
      router.back();
    };

    room.on(RoomEvent.Disconnected, handleDisconnected);

    return () => {
      room.off(RoomEvent.Disconnected, handleDisconnected);
    };
  }, [room, router]);

  const endCall = useCallback(async () => {
    if (!callId || ending) return;

    try {
      setEnding(true);

      if (connected) {
        await updateCallStatus(callId, 'ended');
      } else {
        await updateCallStatus(callId, 'cancelled');
      }

      room?.disconnect();
      router.back();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Impossible de terminer l'appel.";

      setError(message);
    } finally {
      setEnding(false);
    }
  }, [callId, connected, ending, room, router]);

  useEffect(() => {
    if (!callId) {
      router.back();
    }
  }, [callId, router]);

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <Avatar name="Appel" uri={null} size={96} />


        <Text style={styles.title}>Appel audio</Text>


        {connecting ? (
          <>
            <Text style={styles.subtitle}>Connexion à l’appel…</Text>
            <ActivityIndicator color={colors.accent} size="large" />
          </>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : connected ? (
          <Text style={styles.subtitle}>Appel connecté</Text>
        ) : (
          <Text style={styles.subtitle}>Sonnerie…</Text>
        )}


        <Pressable
          style={styles.endButton}
          onPress={endCall}
          disabled={ending}
          accessibilityLabel="Terminer l'appel"
        >
          {ending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Ionicons name="close" size={30} color="#FFFFFF" />
          )}
        </Pressable>
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
  endButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
});