import type { BlockedUser } from '@/services/block.service';
import { getBlockedUsers, unblockUser } from '@/services/block.service';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

function getUserLabel(user: BlockedUser): string {
  if (
    'display_name' in user &&
    typeof user.display_name === 'string' &&
    user.display_name.trim()
  ) {
    return user.display_name;
  }

  if (
    'username' in user &&
    typeof user.username === 'string' &&
    user.username.trim()
  ) {
    return user.username;
  }

  return user.id;
}

export default function BlockedUsersScreen() {
  const router = useRouter();

  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        try {
          const result = await getBlockedUsers();

          if (active) {
            setUsers(result);
            setError('');
          }
        } catch {
          if (active) {
            setError('Impossible de charger la liste.');
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }

      load();

      return () => {
        active = false;
      };
    }, [])
  );

  async function handleUnblock(userId: string) {
    if (busyId) return;

    setBusyId(userId);
    setError('');

    try {
      await unblockUser(userId);
      setUsers((previous) =>
        previous.filter((user) => user.id !== userId)
      );
    } catch {
      setError('Impossible de débloquer cet utilisateur. Réessaie.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={styles.backButton}
      >
        <Text style={styles.back}>←</Text>
      </Pressable>

      <Text style={styles.title}>Utilisateurs bloqués</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#FF8A32" />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            users.length === 0 ? styles.emptyList : styles.list
          }
          renderItem={({ item }) => {
            const label = getUserLabel(item);
            const isBusy = busyId === item.id;

            return (
              <View style={styles.row}>
                <View style={styles.userInfo}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {label}
                  </Text>
                </View>

                <Pressable
                  onPress={() => handleUnblock(item.id)}
                  disabled={isBusy}
                  style={({ pressed }) => [
                    styles.unblockButton,
                    pressed && styles.unblockButtonPressed,
                    isBusy && styles.unblockButtonDisabled,
                  ]}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color="#FF8A32" />
                  ) : (
                    <Text style={styles.unblockText}>Débloquer</Text>
                  )}
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>
                {"Aucun utilisateur bloqué pour l'instant."}
              </Text>
              <Text style={styles.emptySubtitle}>
                Les personnes que tu bloques apparaîtront ici.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  back: {
    fontSize: 28,
    color: '#111111',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 20,
  },
  error: {
    color: '#D93025',
    fontSize: 14,
    marginBottom: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  list: {
    paddingBottom: 32,
  },
  emptyList: {
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },
  userInfo: {
    flex: 1,
    marginRight: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111111',
  },
  unblockButton: {
    minWidth: 96,
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#FF8A32',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  unblockButtonPressed: {
    opacity: 0.7,
  },
  unblockButtonDisabled: {
    opacity: 0.5,
  },
  unblockText: {
    color: '#FF8A32',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
});