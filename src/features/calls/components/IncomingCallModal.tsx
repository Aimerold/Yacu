import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '@/components/ui/Avatar';
import { colors } from '@/theme/tokens';
import type { Call } from '@/services/call.service';
import {
  getCallWithParticipant,
  updateCallStatus,
} from '@/services/call.service';




type Props = {
  call: Call | null;
  onClose: () => void;
};




export default function IncomingCallModal({
  call,
  onClose,
}: Props) {
  const router = useRouter();
  const [handling, setHandling] = useState(false);
  const [error, setError] = useState('');
  const [callerName, setCallerName] = useState('Appel entrant');
  const [callerAvatar, setCallerAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!call) return;

    let active = true;

    void getCallWithParticipant(call.id)
      .then(({ participant }) => {
        if (!active) return;

        setCallerName(participant.fullName || 'Appel entrant');
        setCallerAvatar(participant.avatarUrl);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [call]);

  if (!call) return null;

  async function accept() {
    if (!call || handling) return;

    try {
      setHandling(true);

      await updateCallStatus(call.id, 'accepted');

      onClose();

      router.push({
        pathname: '/call/[callId]',
        params: {
          callId: call.id,
          conversationId: call.conversation_id,
        },
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Impossible d'accepter l'appel.";

      setError(message);
    } finally {
      setHandling(false);
    }
  }

  async function decline() {
    if (!call || handling) return;

    try {
      setHandling(true);

      await updateCallStatus(call.id, 'declined');

      onClose();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Impossible de refuser l’appel.';

      setError(message);
    } finally {
      setHandling(false);
    }
  }




  return (
    <Modal transparent visible>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Avatar name={callerName} uri={callerAvatar} size={88} />


          <Text style={styles.title}>{callerName}</Text>
          <Text style={styles.subtitle}>Appel audio entrant…</Text>


          {error ? <Text style={styles.error}>{error}</Text> : null}


          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.declineButton]}
              onPress={decline}
              disabled={handling}
              accessibilityLabel="Refuser l'appel"
            >
              {handling ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons name="close" size={28} color="#FFFFFF" />
              )}
            </Pressable>

            <Pressable
              style={[styles.button, styles.acceptButton]}
              onPress={accept}
              disabled={handling}
              accessibilityLabel="Accepter l'appel"
            >
              {handling ? (
                <ActivityIndicator color="#081426" />
              ) : (
                <Ionicons name="call" size={28} color="#081426" />
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}



const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.background,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  error: {
    color: '#EF4444',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 28,
    marginTop: 24,
  },
  button: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    backgroundColor: '#EF4444',
  },
  acceptButton: {
    backgroundColor: colors.accent,
  },
});