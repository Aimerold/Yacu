import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getMyConversations } from '@/services/conversation.service';
import type { ConversationSummary } from '@/services/conversation.service';
import { subscribeToMyMessages } from '@/services/message.service';
import { formatListTime } from '@/utils/format';

function previewOf(conversation: ConversationSummary): string {
  const last = conversation.last_message;

  if (!last) return 'Aucun message';

  const text = last.type === 'image' ? '📷 Photo' : last.content ?? '';

  return last.mine ? `Toi : ${text}` : text;
}

export default function ChatsScreen() {
  const router = useRouter();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    try {
      const result = await getMyConversations();
      setConversations(result);
      setError('');
    } catch {
      setError('Impossible de charger tes conversations.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();

      // Rafraîchit la liste quand un message arrive (regroupe les rafales).
      const unsubscribe = subscribeToMyMessages(() => {
        if (reloadTimer.current) clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(() => load(), 400);
      });

      return () => {
        if (reloadTimer.current) clearTimeout(reloadTimer.current);
        unsubscribe();
      };
    }, [load])
  );

  function openConversation(conversationId: string) {
    router.push({
      pathname: '/chat/[conversationId]',
      params: { conversationId },
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Conversations</Text>

      {loading ? (
        <ActivityIndicator color="#FF8A32" size="large" style={styles.loader} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            conversations.length === 0 ? styles.emptyContainer : undefined
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#FF8A32"
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {error || 'Aucune conversation'}
              </Text>
              {!error && (
                <Text style={styles.emptyText}>
                  Va dans Contacts, ouvre un profil et appuie sur « Envoyer un
                  message ».
                </Text>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const name =
              item.other_user?.display_name ||
              item.other_user?.username ||
              'Utilisateur';
            const hasUnread = item.unread_count > 0;
            const time = item.last_message
              ? formatListTime(item.last_message.created_at)
              : '';

            return (
              <Pressable
                style={styles.row}
                onPress={() => openConversation(item.id)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {name.charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.rowText}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>
                      {name}
                    </Text>
                    {!!time && (
                      <Text
                        style={[styles.time, hasUnread && styles.timeUnread]}
                      >
                        {time}
                      </Text>
                    )}
                  </View>

                  <View style={styles.rowBottom}>
                    <Text
                      style={[styles.preview, hasUnread && styles.previewUnread]}
                      numberOfLines={1}
                    >
                      {previewOf(item)}
                    </Text>
                    {hasUnread && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {item.unread_count > 99 ? '99+' : item.unread_count}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#081426',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 20,
  },
  loader: {
    marginTop: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10223A',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#263A54',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: '#FF8A32',
    fontSize: 20,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  name: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  time: {
    color: '#8493A8',
    fontSize: 12,
    marginLeft: 8,
  },
  timeUnread: {
    color: '#FF8A32',
  },
  preview: {
    flex: 1,
    color: '#A8B6C8',
    fontSize: 14,
  },
  previewUnread: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF8A32',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#081426',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyText: {
    color: '#A8B6C8',
    marginTop: 10,
    textAlign: 'center',
  },
});