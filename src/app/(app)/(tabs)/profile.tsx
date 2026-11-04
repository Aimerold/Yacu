import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getMyProfile, getProfileById } from '@/services/profile.service';
import type { Profile } from '@/services/profile.service';

export default function ProfileScreen() {
  const router = useRouter();
  const { id, mine } = useLocalSearchParams<{ id?: string; mine?: string }>();
  const isOwnProfile = mine === 'true' || !id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;

      setLoading(true);
      setProfile(null);
      setError('');

      async function loadProfile() {
        try {
          const result = isOwnProfile
            ? await getMyProfile()
            : await getProfileById(id);

          if (active) setProfile(result);
        } catch (error) {
          console.error('Erreur de chargement du profil :', error);

          if (active) {
            setError('Impossible de charger ce profil.');
          }
        } finally {
          if (active) setLoading(false);
        }
      }

      void loadProfile();

      return () => {
        active = false;
      };
    }, [id, isOwnProfile])
  );

  return (
    <View style={styles.container}>
      {!isOwnProfile && (
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← Retour</Text>
        </Pressable>
      )}

      {loading ? (
        <ActivityIndicator color="#FF8A32" size="large" />
      ) : profile ? (
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(profile.display_name || profile.username)
                .charAt(0)
                .toUpperCase()}
            </Text>
          </View>

          <Text style={styles.name}>
            {profile.display_name || profile.username}
          </Text>
          <Text style={styles.username}>@{profile.username}</Text>
          <Text style={styles.bio}>
            {profile.bio || 'Aucune biographie pour le moment.'}
          </Text>
          {isOwnProfile && (
            <>
              <Pressable
                style={styles.editButton}
                onPress={() => router.push('/(app)/profile-edit')}
              >
                <Text style={styles.editButtonText}>Modifier mon profil</Text>
              </Pressable>

              <Pressable
                style={styles.settingsButton}
                onPress={() => router.push('/(app)/settings')}
              >
                <Text style={styles.settingsButtonText}>Paramètres</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <Text style={styles.error}>{error}</Text>
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
    marginBottom: 35,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#10223A',
    borderRadius: 18,
    padding: 25,
  },
  avatar: {
    width: 85,
    height: 85,
    borderRadius: 43,
    backgroundColor: '#263A54',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  avatarText: {
    color: '#FF8A32',
    fontSize: 34,
    fontWeight: '700',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '700',
  },
  username: {
    color: '#FF8A32',
    marginTop: 7,
  },
  bio: {
    color: '#C1CCDA',
    textAlign: 'center',
    marginTop: 20,
  },
  editButton: {
    backgroundColor: '#FF8A32',
    borderRadius: 12,
    marginTop: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  editButtonText: {
    color: '#081426',
    fontWeight: '700',
  },
  settingsButton: {
    borderColor: '#263A54',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  settingsButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  error: {
    color: '#FF8A32',
    marginTop: 20,
  },
});