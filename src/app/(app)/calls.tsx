import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '@/components/ui/Avatar';
import { colors } from '@/theme/tokens';
import { getCallHistory } from '@/services/call.service';




type CallHistoryItem = {
  id: string;
  conversationId: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  isIncoming: boolean;
  participantName: string;
  participantAvatar: string | null;
};


export default function CallsScreen() {
  const router = useRouter();
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const history = await getCallHistory();

        if (active) setCalls(history);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Impossible de charger les appels.';

        if (active) setError(message);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  function formatDuration(item: CallHistoryItem) {
    if (!item.startedAt || !item.endedAt) return null;

    const startedAt = new Date(item.startedAt).getTime();
    const endedAt = new Date(item.endedAt).getTime();

    const seconds = Math.max(
      0,
      Math.round((endedAt - startedAt) / 1000)
    );

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  function getLabel(item: CallHistoryItem) {
    if (item.status === 'missed') return 'Appel manqué';
    if (item.status === 'declined') return 'Appel refusé';
    if (item.status === 'cancelled') return 'Appel annulé';
    if (item.status === 'ended') return 'Appel terminé';

    return item.isIncoming ? 'Appel entrant' : 'Appel sortant';
  }

  function getIcon(item: CallHistoryItem) {
    if (item.status === 'missed') return 'call-outline';

    return item.isIncoming ? 'arrow-down' : 'arrow-up';
  }

  function getIconColor(item: CallHistoryItem) {
    if (item.status === 'missed') return '#EF4444';

    return colors.textSecondary;
  }

  function openConversation(item: CallHistoryItem) {
    router.push({
      pathname: '/chat/[conversationId]',
      params: {
        conversationId: item.conversationId,
      },
    });
  }


  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }


  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }




  return (
    <View style={styles.container}>
      <Text style={styles.title}>Appels</Text>

      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => openConversation(item)}
          >
            <Avatar
              name={item.participantName}
              uri={item.participantAvatar}
              size={48}
            />


            <View style={styles.details}>
              <Text style={styles.name}>{item.participantName}</Text>
              <Text style={styles.status}>{getLabel(item)}</Text>
            </View>


            <View style={styles.right}>
              {formatDuration(item) ? (
                <Text style={styles.duration}>{formatDuration(item)}</Text>
              ) : null}


              <Ionicons
                name={getIcon(item)}
                size={18}
                color={getIconColor(item)}
              />
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Aucun appel pour le moment.</Text>
        }
      />
    </View>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginVertical: 20,
  },
  list: {
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  details: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  status: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  duration: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  empty: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 40,
  },
  error: {
    color: '#EF4444',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});