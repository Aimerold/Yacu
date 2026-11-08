import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import Avatar from '@/components/ui/Avatar';
import { getBlockedUsers, unblockUser } from '@/services/block.service';
import type { BlockedUser } from '@/services/block.service';

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
          if (active) setError('Impossible de charger la liste.');
        } finally {
          if (active) setLoading(false);
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
      setUsers((previous) => previous.filter((user) => user.id !== userId));
    } catch {
      setError('Impossible de débloquer cet utilisateur. Réessaie.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.back}>← Retour</Text>
      </Pressable>

      <Text style={styles.title}>Utilisateurs bloqués</Text>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <ActivityIndicator color="#FF8A32" size="large" style={styles.loader} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            users.length === 0 ? styles.emptyContainer : undefined
          }
          ListEmptyComponent={
            <Text style={styles.empty}>Tu n'as bloqué personne.</Text>
          }
          renderItem={({ item }) => {
            const name = item.display_name || item.username;

            return (
              <View style={styles.row}>
                <Avatar name={name} uri={item.avatar_url} size={44} />

                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.username} numberOfLines={1}>
                    @{item.username}
                  </Text>
                </View>

                <Pressable
                  style={[
                    styles.unblockButton,
                    busyId === item.id && styles.disabled,
                  ]}
                  onPress={() => handleUnblock(item.id)}
                  disabled={!!busyId}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.unblockText}>Débloquer</Text>
                  )}
                </Pressable>
              </View>
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
    padding: 24,
    paddingTop: 60,
  },
  back: {
    color: '#FF8A32',
    fontSize: 16,
    marginBottom: 30,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 20,
  },
  loader: {
    marginTop: 30,
  },
  error: {
    color: '#FF8A32',
    marginBottom: 14,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    color: '#A8B6C8',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10223A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  info: {
    flex: 1,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  username: {
    color: '#A8B6C8',
    marginTop: 2,
  },
  unblockButton: {
    backgroundColor: '#263A54',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 92,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
  unblockText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});