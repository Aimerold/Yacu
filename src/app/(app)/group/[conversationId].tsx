import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import AppHeader from '@/components/layout/AppHeader';
import Avatar from '@/components/ui/Avatar';

import type { GroupMember } from '@/services/group.service';
import {
  getGroupMembers,
  leaveGroup,
  removeGroupMember,
} from '@/services/group.service';

import { getCurrentUserId } from '@/services/conversation.service';
import { colors } from '@/theme/tokens';

export default function GroupInfoScreen() {
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{
    conversationId: string;
  }>();

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');

  // Cette fonction récupère les données sans modifier directement le state.
  const fetchGroupData = useCallback(async () => {
    if (!conversationId) {
      throw new Error('Identifiant du groupe introuvable.');
    }

    const [result, userId] = await Promise.all([
      getGroupMembers(conversationId),
      getCurrentUserId(),
    ]);

    return { result, userId };
  }, [conversationId]);

  // Chargement initial : les mises à jour d'état sont faites après la réponse réseau.
  useEffect(() => {
    let active = true;

    fetchGroupData()
      .then(({ result, userId }) => {
        if (!active) return;

        setMembers(result);
        setMyId(userId);
        setError('');
      })
      .catch((e: unknown) => {
        if (!active) return;

        const message =
          e instanceof Error ? e.message : 'Erreur inconnue.';

        console.log('[Yacu GroupInfo] Erreur:', e);
        setError(message);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [fetchGroupData]);

  // Rechargement manuel après une action ou un geste de rafraîchissement.
  const load = useCallback(async (isRefresh = false) => {
    if (!conversationId) return;

    if (isRefresh) {
      setRefreshing(true);
    }

    try {
      const { result, userId } = await fetchGroupData();

      setMembers(result);
      setMyId(userId);
      setError('');
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Erreur inconnue.';

      console.log('[Yacu GroupInfo] Erreur:', e);
      setError(message);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [conversationId, fetchGroupData]);

  const isAdmin =
    !!myId &&
    members.some(
      (member) =>
        member.user_id === myId &&
        member.role === 'admin'
    );

  async function handleRemove(member: GroupMember) {
    if (!conversationId) return;

    Alert.alert(
      'Retirer le membre',
      `Retirer ${
        member.display_name || member.username
      } du groupe ?`,
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await removeGroupMember(
                  conversationId,
                  member.user_id
                );

                await load(true);
              } catch (e) {
                const message =
                  e instanceof Error
                    ? e.message
                    : 'Impossible de retirer ce membre.';

                console.log(
                  '[Yacu GroupInfo] Erreur retirer membre:',
                  e
                );

                Alert.alert('Erreur', message);
              }
            })();
          },
        },
      ]
    );
  }

  function handleLeave() {
    if (!conversationId || leaving) return;

    Alert.alert(
      'Quitter le groupe',
      'Tu ne pourras plus voir les nouveaux messages de ce groupe.',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Quitter',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setLeaving(true);

              try {
                await leaveGroup(conversationId);

                router.replace('/chats');
              } catch (e) {
                const message =
                  e instanceof Error
                    ? e.message
                    : 'Impossible de quitter le groupe.';

                console.log(
                  '[Yacu GroupInfo] Erreur quitter groupe:',
                  e
                );

                Alert.alert('Erreur', message);
              } finally {
                setLeaving(false);
              }
            })();
          },
        },
      ]
    );
  }

  function renderMember({ item }: { item: GroupMember }) {
    const isMe = item.user_id === myId;
    const name = item.display_name || item.username;

    return (
      <View style={styles.memberRow}>
        <Avatar
          name={name}
          uri={item.avatar_url}
          size={44}
        />

        <View style={styles.memberText}>
          <Text
            style={styles.memberName}
            numberOfLines={1}
          >
            {name}
            {isMe ? ' · Toi' : ''}
          </Text>

          <Text
            style={styles.memberUsername}
            numberOfLines={1}
          >
            @{item.username}
          </Text>
        </View>

        <Text style={styles.role}>
          {item.role === 'admin' ? 'Admin' : 'Membre'}
        </Text>

        {isAdmin && !isMe && item.role !== 'admin' && (
          <Pressable
            onPress={() => handleRemove(item)}
            hitSlop={10}
            accessibilityLabel={`Retirer ${name} du groupe`}
          >
            <Ionicons
              name="person-remove"
              size={20}
              color="#ef4444"
            />
          </Pressable>
        )}
      </View>
    );
  }

  function renderHeader() {
    return (
      <View>
        <Text style={styles.title}>
          Membres du groupe
        </Text>

        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : null}

        <Text style={styles.count}>
          {members.length} membre
          {members.length > 1 ? 's' : ''}
        </Text>

        {isAdmin && (
          <Pressable
            style={styles.addMembersButton}
            onPress={() =>
              router.push({
                pathname:
                  '/group/[conversationId]/add-members',
                params: { conversationId },
              })
            }
            accessibilityLabel="Ajouter des membres"
          >
            <Ionicons
              name="person-add"
              size={18}
              color={colors.onAccent}
            />

            <Text style={styles.addMembersText}>
              Ajouter des membres
            </Text>
          </Pressable>
        )}

        {isAdmin && (
          <Pressable
            style={styles.editGroupButton}
            onPress={() =>
              router.push({
                pathname:
                  '/group/[conversationId]/edit-group',
                params: { conversationId },
              })
            }
            accessibilityLabel="Modifier le groupe"
          >
            <Ionicons
              name="create-outline"
              size={18}
              color={colors.onAccent}
            />

            <Text style={styles.editGroupText}>
              Modifier le groupe
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  function renderFooter() {
    return (
      <View style={styles.footer}>
        {!isAdmin && (
          <Pressable
            style={[
              styles.leaveButton,
              leaving && styles.leaveButtonDisabled,
            ]}
            onPress={handleLeave}
            disabled={leaving}
            accessibilityLabel="Quitter le groupe"
          >
            {leaving ? (
              <ActivityIndicator
                size="small"
                color="#ef4444"
              />
            ) : (
              <Ionicons
                name="log-out-outline"
                size={20}
                color="#ef4444"
              />
            )}

            <Text style={styles.leaveText}>
              {leaving
                ? 'Quitter...'
                : 'Quitter le groupe'}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader />

      {loading ? (
        <ActivityIndicator
          color={colors.accent}
          size="large"
          style={styles.loader}
        />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.user_id}
          renderItem={renderMember}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={colors.accent}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  loader: {
    marginTop: 40,
  },

  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 8,
  },

  count: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: 20,
  },

  error: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 16,
  },

  addMembersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },

  addMembersText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '700',
  },

  editGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },

  editGroupText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },

  memberText: {
    flex: 1,
  },

  memberName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },

  memberUsername: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },

  role: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },

  footer: {
    marginTop: 20,
  },

  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 14,
    paddingVertical: 14,
  },

  leaveButtonDisabled: {
    opacity: 0.6,
  },

  leaveText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '700',
  },
});
