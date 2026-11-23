
import { supabase } from '@/lib/supabase';
import type { Call } from '@/services/call.service';
import { getLatestCall } from '@/services/call.service';
import { colors } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  conversationId: string;
};

export default function CallHistory({ conversationId }: Props) {
  const router = useRouter();

  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        // Récupérer l'utilisateur connecté
        const { data: sessionData } = await supabase.auth.getSession();

        if (active) {
          setCurrentUserId(sessionData.session?.user.id ?? null);
        }

        // Récupérer le dernier appel
        const latestCall = await getLatestCall(conversationId);

        if (active) {
          setCall(latestCall);
        }
      } catch (error) {
        console.error('Erreur lors du chargement de l’appel :', error);

        if (active) {
          setCall(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    // Écouter les changements en temps réel dans la table calls
    const channel = supabase
      .channel(`call-history:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void getLatestCall(conversationId)
            .then((latestCall) => {
              if (active) {
                setCall(latestCall);
              }
            })
            .catch(() => undefined);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  if (!call) return null;

  // Déterminer si l'appel est entrant
  const isIncoming =
    currentUserId !== null &&
    call.callee_id === currentUserId;

  const label =
    call.status === 'missed'
      ? 'Appel manqué'
      : call.status === 'declined'
        ? 'Appel refusé'
        : call.status === 'cancelled'
          ? 'Appel annulé'
          : 'Appel';

  const iconName: keyof typeof Ionicons.glyphMap =
    call.status === 'missed'
      ? 'call-outline'
      : isIncoming
        ? 'arrow-down'
        : 'arrow-up';

  const iconColor =
    call.status === 'missed' ? '#EF4444' : colors.textSecondary;

  const time = call.created_at
    ? new Date(call.created_at).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  // Formater la durée de l'appel
  function formatDuration(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // Calculer la durée de l'appel
  function getDuration(currentCall: Call) {
    if (!currentCall.started_at || !currentCall.ended_at) {
      return null;
    }

    const startedAt = new Date(currentCall.started_at).getTime();
    const endedAt = new Date(currentCall.ended_at).getTime();

    const seconds = Math.max(
      0,
      Math.round((endedAt - startedAt) / 1000)
    );

    return formatDuration(seconds);
  }

  const duration = getDuration(call);

  // Ouvrir l'écran de l'appel
  function openCall() {
    const currentCall = call;

    if (!currentCall) return;

    if (
      currentCall.status !== 'ringing' &&
      currentCall.status !== 'accepted'
    ) {
      return;
    }

    router.push({
      pathname: '/call/[callId]',
      params: {
        callId: currentCall.id,
        conversationId: currentCall.conversation_id,
      },
    });
  }


  return (
    <Pressable style={styles.container} onPress={openCall}>
      <Ionicons name={iconName} size={18} color={iconColor} />

      <Text style={styles.label}>{label}</Text>

      {duration ? (
        <Text style={styles.duration}>{duration}</Text>
      ) : null}

      <Text style={styles.time}>{time}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    flex: 1,
  },
  duration: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  time: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});
