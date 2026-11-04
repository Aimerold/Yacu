
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getProfileById } from '@/services/profile.service';
import type { Profile } from '@/services/profile.service';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const router = useRouter();
  const { id, mine } = useLocalSearchParams<{id?: string;mine?: string;}>();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    
let active = true;

async function loadProfile() {
    try {
      let profileId = id;

      if (mine === 'true') {
        const { data, error } = await supabase.auth.getUser();

        if (error) throw error;
        if (!data.user) throw new Error('Utilisateur non connecté.');

        profileId = data.user.id;
      }

      if (!profileId) {
        throw new Error('Identifiant du profil manquant.');
      }

      const result = await getProfileById(profileId);

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


  loadProfile();

    return () => {
      active = false;
    };
  }, [id]);

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Retour</Text>
      </Pressable>

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
  error: {
    color: '#FF8A32',
    marginTop: 20,
  },
});
