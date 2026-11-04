import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { searchUsers } from '@/services/users.service';
import type { Profile } from '@/services/profile.service';

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSearch() {
    if (query.trim().length < 2) {
      setUsers([]);
      setErrorMessage('Saisis au moins 2 caractères.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const results = await searchUsers(query);
      setUsers(results);
      if (results.length === 0) {
        setErrorMessage('Aucun utilisateur trouvé.');
      }
    } catch (error) {
      console.error('Erreur de recherche :', error);
      setErrorMessage('Impossible de rechercher les utilisateurs.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Yacu<Text style={styles.orange}>.</Text></Text>
      <Text style={styles.heading}>Découvrir</Text>
      <Text style={styles.subtitle}>
        Recherche et découvre les membres de Yacu.
      </Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Nom ou nom d’utilisateur..."
          placeholderTextColor="#8493A8"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCapitalize="none"
        />
        <Pressable
          style={styles.searchButton}
          onPress={handleSearch}
          disabled={loading}
        >
          <Text style={styles.searchButtonText}>Chercher</Text>
        </Pressable>
      </View>

      {loading && <ActivityIndicator color="#FF8A32" />}

      {!!errorMessage && !loading && (
        <Text style={styles.message}>{errorMessage}</Text>
      )}

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(item.display_name || item.username)
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>

            <View style={styles.userInfo}>
              <Text style={styles.displayName}>
                {item.display_name || item.username}
              </Text>
              <Text style={styles.username}>@{item.username}</Text>
              {!!item.bio && (
                <Text style={styles.bio} numberOfLines={2}>
                  {item.bio}
                </Text>
              )}
            </View>

            <Pressable
              style={styles.profileButton}
              onPress={() =>
                router.push({
                  pathname: '/user/[id]',
                  params: { id: item.id },
                })
              }
            >
              <Text style={styles.profileButtonText}>Voir</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#081426',
    padding: 22,
    paddingTop: 60,
  },
  logo: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  orange: {
    color: '#FF8A32',
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '700',
    marginTop: 24,
  },
  subtitle: {
    color: '#9BAAC0',
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
    backgroundColor: '#10223A',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#263A54',
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  searchButton: {
    backgroundColor: '#FF8A32',
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#081426',
    fontWeight: '700',
  },
  message: {
    color: '#AAB8CB',
    marginBottom: 16,
  },
  list: {
    paddingBottom: 30,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10223A',
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#263A54',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FF8A32',
    fontSize: 20,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  displayName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  username: {
    color: '#FF8A32',
    marginTop: 3,
  },
  bio: {
    color: '#9BAAC0',
    marginTop: 5,
    fontSize: 12,
  },
  profileButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#263A54',
    borderRadius: 9,
  },
  profileButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});