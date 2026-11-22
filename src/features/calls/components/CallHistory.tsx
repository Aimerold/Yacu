import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/tokens';
import type { Call } from '@/services/call.service';
import { getLatestCall } from '@/services/call.service';


type Props = {
  conversationId: string;
};

export default function CallHistory({ conversationId }: Props) {
  const router = useRouter();
  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const latestCall = await getLatestCall(conversationId);

        if (active) setCall(latestCall);
      } catch {
        if (active) setCall(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
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
              if (active) setCall(latestCall);
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
  const isIncoming = call.callee_id === call.current_user_id;
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

  function openCall() {
    if (!call) return;

    router.push({
      pathname: '/call/[callId]',
      params: {
        callId: call.id,
        conversationId: call.conversation_id,
      },
    });
  }

  return (
    <Pressable style={styles.container} onPress={openCall}>
      <Ionicons name={iconName} size={18} color={iconColor} />


      <Text style={styles.label}>{label}</Text>
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
  time: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});