import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import AppHeader from '@/components/layout/AppHeader';
import Avatar from '@/components/ui/Avatar';
import { getMyConversations } from '@/services/conversation.service';
import type { ConversationSummary } from '@/services/conversation.service';
import { subscribeToMyMessages } from '@/services/message.service';
import { formatListTime } from '@/utils/format';
import { colors } from '@/theme/tokens';

function previewOf(conversation: ConversationSummary): string {
  const last = conversation.last_message;

  if (!last) return 'Aucun message';

  const text = last.type === 'image' ? '📷 Photo' : last.content ?? '';

  return last.mine ? `Toi : ${text}` : text;
}

/** Minuscules et sans accents, pour une recherche tolérante. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function ChatsScreen() {
  const router = useRouter();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [query, setQuery] = useState('');
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

  const trimmedQuery = query.trim();

  const filtered = useMemo(() => {
    const needle = normalize(trimmedQuery);

    if (!needle) return conversations;

    return conversations.filter((conversation) =>
      normalize(
        `${conversation.other_user?.display_name ?? ''} ${
          conversation.other_user?.username ?? ''
        }`
      ).includes(needle)
    );
  }, [conversations, trimmedQuery]);

  function openConversation(conversationId: string) {
    router.push({
      pathname: '/chat/[conversationId]',
      params: { conversationId },
    });
  }

  const noResults = conversations.length > 0 && !!trimmedQuery;

  return (
    <View style={styles.container}>
      <AppHeader />

      <View style={styles.body}>
        <Text style={styles.title}>Conversations</Text>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher une conversation..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={10}
              accessibilityLabel="Effacer la recherche"
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {loading ? (
          <ActivityIndicator
            color={colors.accent}
            size="large"
            style={styles.loader}
          />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={
              filtered.length === 0 ? styles.emptyContainer : undefined
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={colors.accent}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>
                  {error ||
                    (noResults
                      ? `Aucun résultat pour « ${trimmedQuery} »`
                      : 'Aucune conversation')}
                </Text>
                {!error && !noResults && (
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
                  <View style={styles.avatarWrap}>
                    <Avatar
                      name={name}
                      uri={item.other_user?.avatar_url}
                      size={48}
                    />
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
                        style={[
                          styles.preview,
                          hasUnread && styles.previewUnread,
                        ]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 14,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 46,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 10,
  },
  loader: {
    marginTop: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  avatarWrap: {
    marginRight: 14,
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
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  time: {
    color: colors.textMuted,
    fontSize: 12,
    marginLeft: 8,
  },
  timeUnread: {
    color: colors.accent,
  },
  preview: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 14,
  },
  previewUnread: {
    color: colors.text,
    fontWeight: '600',
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: colors.onAccent,
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
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    marginTop: 10,
    textAlign: 'center',
  },
});