import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { SectionListData } from 'react-native';
import { useRouter } from 'expo-router';
import AppHeader from '@/components/layout/AppHeader';
import Avatar from '@/components/ui/Avatar';
import FriendActionButton from '@/features/contacts/components/FriendActionButton';
import { useFriendships } from '@/features/contacts/hooks/useFriendships';
import { searchUsers } from '@/services/user-search.service';
import type { Profile } from '@/services/profile.service';
import type { FriendshipRequest, RelationState } from '@/services/friendship.service';
import { colors } from '@/theme/tokens';

type ContactSectionKind = 'received' | 'sent' | 'friend';
type ContactSection = {
  title: string;
  kind: ContactSectionKind;
  data: FriendshipRequest[];
};
type ContactTab = 'discover' | 'requests' | 'friends';

const EMPTY_RELATION = { state: 'none', requestId: null } as const;

export default function ContactsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ContactTab>('discover');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const friendships = useFriendships({
    userIds: users.map((user) => user.id),
    loadLists: activeTab !== 'discover',
  });

  async function handleSearch() {
    if (query.trim().length < 2) {
      setUsers([]);
      setSearchError('Saisis au moins 2 caractères.');
      return;
    }

    setSearchLoading(true);
    setSearchError('');

    try {
      const results = await searchUsers(query);
      setUsers(results);
      if (results.length === 0) setSearchError('Aucun utilisateur trouvé.');
    } catch (error) {
      console.error('Erreur de recherche :', error);
      setSearchError('Impossible de rechercher les utilisateurs.');
    } finally {
      setSearchLoading(false);
    }
  }

  const requestSections = useMemo<ContactSection[]>(() => {
    const sections: ContactSection[] = [
      {
        title: 'Demandes reçues',
        kind: 'received',
        data: friendships.incomingRequests,
      },
      {
        title: 'Demandes envoyées',
        kind: 'sent',
        data: friendships.outgoingRequests,
      },
    ];
    return sections.filter((section) => section.data.length > 0);
  }, [friendships.incomingRequests, friendships.outgoingRequests]);

  function openProfile(userId: string) {
    router.push({ pathname: '/user/[id]', params: { id: userId } });
  }

  function renderFriendAction(
    userId: string,
    relation: { state: RelationState; requestId: string | null }
  ) {
    return (
      <FriendActionButton
        relation={relation}
        onSend={() => friendships.send(userId)}
        onCancel={friendships.cancel}
        onRespond={friendships.respond}
        onRemove={() => friendships.remove(userId)}
      />
    );
  }

  function renderSearchResult({ item }: { item: Profile }) {
    const name = item.display_name || item.username;
    return (
      <View style={styles.userCard}>
        <Avatar name={name} uri={item.avatar_url} size={46} />

        <View style={styles.userInfo}>
          <Text style={styles.displayName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.username} numberOfLines={1}>
            @{item.username}
          </Text>
          {!!item.bio && (
            <Text style={styles.bio} numberOfLines={2}>
              {item.bio}
            </Text>
          )}
        </View>

        <View style={styles.cardActions}>
          <Pressable
            style={styles.profileButton}
            onPress={() => openProfile(item.id)}
          >
            <Text style={styles.profileButtonText}>Voir</Text>
          </Pressable>
          {renderFriendAction(
            item.id,
            friendships.relations.get(item.id) ?? EMPTY_RELATION
          )}
        </View>
      </View>
    );
  }

  function renderListPerson(
    item: FriendshipRequest,
    kind: ContactSectionKind
  ) {
    const relationState: RelationState =
      kind === 'received'
        ? 'request_received'
        : kind === 'sent'
          ? 'request_sent'
          : 'friends';

    return (
      <View style={styles.userCard}>
        <Pressable
          style={styles.person}
          onPress={() => openProfile(item.profile.id)}
        >
          <Avatar
            name={item.profile.display_name || item.profile.username}
            uri={item.profile.avatar_url}
            size={46}
          />
          <View style={styles.userInfo}>
            <Text style={styles.displayName} numberOfLines={1}>
              {item.profile.display_name || item.profile.username}
            </Text>
            <Text style={styles.username} numberOfLines={1}>
              @{item.profile.username}
            </Text>
          </View>
        </Pressable>
        {renderFriendAction(item.profile.id, {
          state: relationState,
          requestId: item.id,
        })}
      </View>
    );
  }

  const emptyListMessage =
    activeTab === 'requests'
      ? 'Tu n’as aucune demande pour le moment.'
      : 'Tu n’as pas encore d’amis.';

  return (
    <View style={styles.container}>
      <AppHeader />

      <View style={styles.body}>
        <View style={styles.tabs}>
          <TabButton
            label="Découvrir"
            selected={activeTab === 'discover'}
            onPress={() => setActiveTab('discover')}
          />
          <TabButton
            label="Demandes"
            badge={friendships.incomingCount}
            selected={activeTab === 'requests'}
            onPress={() => setActiveTab('requests')}
          />
          <TabButton
            label="Amis"
            selected={activeTab === 'friends'}
            onPress={() => setActiveTab('friends')}
          />
        </View>

        {activeTab === 'discover' ? (
          <>
            <Text style={styles.heading}>Découvrir</Text>
            <Text style={styles.subtitle}>
              Recherche et découvre les membres de Yacu.
            </Text>

            <View style={styles.searchRow}>
              <TextInput
                style={styles.input}
                placeholder="Nom ou nom d’utilisateur..."
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                autoCapitalize="none"
              />
              <Pressable
                style={[
                  styles.searchButton,
                  searchLoading && styles.disabled,
                ]}
                onPress={handleSearch}
                disabled={searchLoading}
              >
                <Text style={styles.searchButtonText}>Chercher</Text>
              </Pressable>
            </View>

            {searchLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <>
                {!!searchError && (
                  <Text style={styles.message}>{searchError}</Text>
                )}
                <FlatList
                  data={users}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.list}
                  keyboardShouldPersistTaps="handled"
                  renderItem={renderSearchResult}
                />
              </>
            )}
          </>
        ) : (
          <>
            <Text style={styles.heading}>
              {activeTab === 'requests' ? 'Demandes' : 'Amis'}
            </Text>
            {!!friendships.error && (
              <Text style={styles.message}>{friendships.error}</Text>
            )}
            {friendships.loading ? (
              <ActivityIndicator
                color={colors.accent}
                style={styles.loader}
              />
            ) : activeTab === 'requests' ? (
              <SectionList<FriendshipRequest, ContactSection>
                sections={requestSections}
                keyExtractor={(item) => item.id}
                renderSectionHeader={({
                  section,
                }: {
                  section: SectionListData<
                    FriendshipRequest,
                    ContactSection
                  >;
                }) => (
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                )}
                renderItem={({ item, section }) =>
                  renderListPerson(item, section.kind)
                }
                contentContainerStyle={
                  requestSections.length === 0
                    ? styles.emptyContainer
                    : styles.list
                }
                ListEmptyComponent={
                  <EmptyState message={emptyListMessage} />
                }
              />
            ) : (
              <FlatList
                data={friendships.friends}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => renderListPerson(item, 'friend')}
                contentContainerStyle={
                  friendships.friends.length === 0
                    ? styles.emptyContainer
                    : styles.list
                }
                ListEmptyComponent={
                  <EmptyState message={emptyListMessage} />
                }
              />
            )}
          </>
        )}
      </View>
    </View>
  );
}

function TabButton({
  label,
  selected,
  badge = 0,
  onPress,
}: {
  label: string;
  selected: boolean;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.tabButton, selected && styles.selectedTab]}
      onPress={onPress}
    >
      <Text style={[styles.tabText, selected && styles.selectedTabText]}>
        {label}
      </Text>
      {badge > 0 && (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{message}</Text>
      <Text style={styles.emptyText}>
        Les nouvelles relations apparaîtront ici.
      </Text>
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
    paddingHorizontal: 22,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  tabButton: {
    minHeight: 40,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: colors.surface,
  },
  selectedTab: {
    backgroundColor: colors.accent,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  selectedTabText: {
    color: colors.onAccent,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.border,
  },
  tabBadgeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
  heading: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '700',
    marginTop: 14,
  },
  subtitle: {
    color: colors.textSecondary,
    marginTop: 8,
    marginBottom: 22,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  searchButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: colors.onAccent,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
  message: {
    color: colors.textSecondary,
    marginBottom: 16,
  },
  list: {
    paddingBottom: 30,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    gap: 12,
  },
  person: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  cardActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  displayName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  username: {
    color: colors.accent,
    marginTop: 3,
  },
  bio: {
    color: colors.textSecondary,
    marginTop: 5,
    fontSize: 12,
  },
  profileButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.border,
    borderRadius: 9,
  },
  profileButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  loader: {
    marginTop: 40,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 10,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    padding: 28,
    backgroundColor: colors.surface,
    borderRadius: 16,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
