import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '@/components/layout/AppHeader';
import {
  addGroupMembers,
  getAvailableUsersToAdd,
} from '@/services/group.service';
import type { AvailableUser } from '@/services/group.service';
import { colors } from '@/theme/tokens';




export default function AddMembersScreen() {
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{
    conversationId: string;
  }>();


  const [users, setUsers] = useState<AvailableUser[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');



  const load = useCallback(async () => {
    if (!conversationId) return;


    try {
      setLoading(true);
      setError('');


      const available = await getAvailableUsersToAdd(conversationId, search);


      setUsers(available);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : 'Impossible de charger les utilisateurs.';


      setError(message);
    } finally {
      setLoading(false);
    }
  }, [conversationId, search]);



  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 300);


    return () => clearTimeout(timer);
  }, [load]);



  function toggle(userId: string) {
    setSelected((previous) =>
      previous.includes(userId)
        ? previous.filter((id) => id !== userId)
        : [...previous, userId]
    );
  }



  async function handleAdd() {
    if (!conversationId || selected.length === 0) return;


    try {
      setSaving(true);
      setError('');


      await addGroupMembers(conversationId, selected);


      router.back();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Impossible d'ajouter les membres.";


      setError(message);
    } finally {
      setSaving(false);
    }
  }



  function renderUser({ item }: { item: AvailableUser }) {
    const isSelected = selected.includes(item.id);


    return (
      <Pressable
        style={styles.userRow}
        onPress={() => toggle(item.id)}
        accessibilityLabel={`Sélectionner ${item.display_name ?? item.username}`}
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>
              {(item.display_name ?? item.username ?? '?')
                .charAt(0)
                .toUpperCase()}
            </Text>
          </View>
        )}


        <View style={styles.userInfo}>
          <Text style={styles.userName}>
            {item.display_name || item.username}
          </Text>


          <Text style={styles.userUsername}>@{item.username}</Text>
        </View>


        <View
          style={[styles.checkbox, isSelected && styles.checkboxSelected]}
        >
          {isSelected && (
            <Ionicons name="checkmark" size={16} color={colors.onAccent} />
          )}
        </View>
      </Pressable>
    );
  }



  return (
    <View style={styles.container}>
      <AppHeader />


      <View style={styles.content}>
        <Text style={styles.title}>Ajouter des membres</Text>


        <TextInput
          style={styles.search}
          placeholder="Rechercher un utilisateur"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />


        {loading ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : users.length === 0 ? (
          <Text style={styles.empty}>Aucun utilisateur disponible.</Text>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(item) => item.id}
            renderItem={renderUser}
            contentContainerStyle={styles.list}
          />
        )}
      </View>


      <View style={styles.footer}>
        <Pressable
          style={[
            styles.addButton,
            (selected.length === 0 || saving) && styles.disabledButton,
          ]}
          onPress={handleAdd}
          disabled={selected.length === 0 || saving}
          accessibilityLabel="Ajouter les membres sélectionnés"
        >
          {saving ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.addButtonText}>
              Ajouter {selected.length > 0 ? `(${selected.length})` : ''}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 16,
  },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    color: colors.text,
    paddingHorizontal: 14,
    minHeight: 48,
    marginBottom: 16,
  },
  list: {
    paddingBottom: 120,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  userUsername: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  error: {
    color: '#ef4444',
    marginTop: 16,
  },
  empty: {
    color: colors.textSecondary,
    marginTop: 16,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    backgroundColor: colors.background,
  },
  addButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  addButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
});