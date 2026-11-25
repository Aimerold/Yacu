import AppHeader from '@/components/layout/AppHeader';
import { getFriends } from '@/services/friendship.service';
import { createGroup } from '@/services/group.service';
import { colors } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Friend = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export default function CreateGroupScreen() {
  const router = useRouter();

  const [groupName, setGroupName] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const loadFriends = useCallback(async () => {
    try {
      const result = await getFriends();

      const formattedFriends = result
        .filter((friend) => friend.profile)
        .map((friend) => ({
          id: friend.profile.id,
          username: friend.profile.username,
          display_name: friend.profile.display_name,
          avatar_url: friend.profile.avatar_url,
        }));

      setFriends(formattedFriends);
    } catch (e) {
      console.error('[Yacu CreateGroup] Erreur chargement amis :', e);
      setError("Impossible de récupérer ta liste d'amis.");
    } finally {
      setLoadingFriends(false);
    }
  }, []);

  useEffect(() => {
    // Les setState de loadFriends sont tous APRÈS un await,
    // donc asynchrones : pas de rendu en cascade.
    // On encapsule dans une IIFE async pour satisfaire la règle du linter.
    let cancelled = false;

    (async () => {
      if (!cancelled) {
        await loadFriends();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadFriends]);

  function toggleFriend(friendId: string) {
    setSelectedIds((previous) =>
      previous.includes(friendId)
        ? previous.filter((id) => id !== friendId)
        : [...previous, friendId]
    );
  }

  async function handleCreateGroup() {
    const name = groupName.trim();

    if (name.length < 2) {
      setError('Le nom du groupe doit contenir au moins 2 caractères.');
      return;
    }

    if (selectedIds.length === 0) {
      setError('Sélectionne au moins un ami pour créer ton groupe.');
      return;
    }

    try {
      setCreating(true);
      setError('');

      const result = await createGroup(name, selectedIds);

      router.replace({
        pathname: '/chat/[conversationId]',
        params: { conversationId: result.conversationId },
      });
    } catch (e) {
      console.error('[Yacu CreateGroup] Erreur création groupe :', e);

      const message =
        e instanceof Error
          ? e.message
          : 'Impossible de créer le groupe.';

      setError(message);
      Alert.alert('Erreur', message);
    } finally {
      setCreating(false);
    }
  }

  const filteredFriends = friends.filter((friend) => {
    const query = search.trim().toLowerCase();

    if (!query) return true;

    return (
      (friend.display_name ?? '').toLowerCase().includes(query) ||
      (friend.username ?? '').toLowerCase().includes(query)
    );
  });

  function renderFriend({ item }: { item: Friend }) {
    const selected = selectedIds.includes(item.id);
    const name = item.display_name || item.username;

    return (
      <Pressable
        style={styles.friendItem}
        onPress={() => toggleFriend(item.id)}
        accessibilityLabel={
          selected
            ? `Retirer ${name} du groupe`
            : `Ajouter ${name} au groupe`
        }
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarLetter}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.friendInfo}>
          <Text style={styles.friendName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.username} numberOfLines={1}>
            @{item.username}
          </Text>
        </View>

        <View
          style={[
            styles.checkbox,
            selected && styles.checkboxSelected,
          ]}
        >
          {selected && (
            <Ionicons name="checkmark" size={16} color={colors.onAccent} />
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Nouveau groupe</Text>

          <Text style={styles.label}>Nom du groupe</Text>
          <TextInput
            style={styles.input}
            placeholder="Exemple : Mes amis"
            placeholderTextColor={colors.textMuted}
            value={groupName}
            onChangeText={setGroupName}
            maxLength={40}
          />

          <View style={styles.sectionHeader}>
            <Text style={styles.label}>Ajouter des membres</Text>
            <Text style={styles.selectedCount}>
              {selectedIds.length} sélectionné(s)
            </Text>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher un ami..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {loadingFriends ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.loadingText}>Chargement des amis...</Text>
            </View>
          ) : friends.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Aucun ami disponible</Text>
              <Text style={styles.emptyText}>
                Ajoute des amis avant de créer un groupe.
              </Text>
            </View>
          ) : filteredFriends.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                Aucun résultat pour cette recherche.
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredFriends}
              keyExtractor={(item) => item.id}
              renderItem={renderFriend}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[
              styles.createButton,
              (creating || loadingFriends) && styles.disabledButton,
            ]}
            onPress={handleCreateGroup}
            disabled={creating || loadingFriends}
            accessibilityLabel="Créer le groupe"
          >
            {creating ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.createButtonText}>
                Créer le groupe ({selectedIds.length + 1})
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 140,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 20,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    color: colors.text,
    paddingHorizontal: 14,
    minHeight: 48,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedCount: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  error: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 12,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  loadingText: {
    color: colors.textMuted,
    marginTop: 12,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surface,
  },
  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.accent,
  },
  friendInfo: {
    flex: 1,
    marginLeft: 12,
  },
  friendName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  username: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 3,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 30,
    backgroundColor: colors.background,
  },
  createButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  createButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
});