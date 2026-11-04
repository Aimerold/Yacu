import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { getMyProfile, updateMyProfile } from '@/services/profile.service';
import type { Profile } from '@/services/profile.service';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
const DISPLAY_NAME_MAX = 50;
const BIO_MAX = 160;

export default function ProfileEditScreen() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await getMyProfile();

        if (!active) return;

        setProfile(result);
        setDisplayName(result.display_name ?? '');
        setUsername(result.username);
        setBio(result.bio ?? '');
      } catch {
        if (active) setError('Impossible de charger ton profil.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  async function handleSave() {
    if (!profile || saving) return;

    const changes: { display_name?: string; username?: string; bio?: string } = {};
    const nextName = displayName.trim();
    const nextUsername = username.trim();
    const nextBio = bio.trim();

    if (nextName !== (profile.display_name ?? '')) {
      if (nextName.length < 1) {
        setError("Le nom d'affichage ne peut pas être vide.");
        return;
      }
      changes.display_name = nextName;
    }

    if (nextUsername !== profile.username) {
      if (!USERNAME_PATTERN.test(nextUsername)) {
        setError(
          "Nom d'utilisateur : 3 à 20 caractères, lettres, chiffres et _ uniquement."
        );
        return;
      }
      changes.username = nextUsername;
    }

    if (nextBio !== (profile.bio ?? '')) {
      changes.bio = nextBio;
    }

    if (Object.keys(changes).length === 0) {
      router.back();
      return;
    }

    setSaving(true);
    setError('');

    try {
      await updateMyProfile(changes);
      router.back();
    } catch (e) {
      const message = e instanceof Error ? e.message.toLowerCase() : '';

      if (
        message.includes('duplicate') ||
        message.includes('unique') ||
        message.includes('23505')
      ) {
        setError("Ce nom d'utilisateur est déjà pris.");
      } else {
        setError('Impossible de enregistrer les modifications. Réessaie.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>← Annuler</Text>
        </Pressable>

        <Text style={styles.title}>Modifier mon profil</Text>

        {loading ? (
          <ActivityIndicator color="#FF8A32" size="large" style={styles.loader} />
        ) : !profile ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <View>
            <Text style={styles.label}>Nom d'affichage</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={DISPLAY_NAME_MAX}
              placeholder="Ton nom"
              placeholderTextColor="#8493A8"
            />

            <Text style={styles.label}>Nom d'utilisateur</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              maxLength={20}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="nom_utilisateur"
              placeholderTextColor="#8493A8"
            />

            <Text style={styles.label}>Biographie</Text>
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={setBio}
              maxLength={BIO_MAX}
              multiline
              placeholder="Parle un peu de toi"
              placeholderTextColor="#8493A8"
            />
            <Text style={styles.counter}>
              {bio.length}/{BIO_MAX}
            </Text>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.saveButton, saving && styles.saveDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#081426" />
              ) : (
                <Text style={styles.saveText}>Enregistrer</Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#081426',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  back: {
    color: '#FF8A32',
    fontSize: 16,
    marginBottom: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 24,
  },
  loader: {
    marginTop: 30,
  },
  label: {
    color: '#A8B6C8',
    fontSize: 13,
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#10223A',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#263A54',
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    marginBottom: 8,
  },
  bioInput: {
    minHeight: 100,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  counter: {
    color: '#8493A8',
    fontSize: 12,
    textAlign: 'right',
  },
  error: {
    color: '#FF8A32',
    marginTop: 14,
  },
  saveButton: {
    backgroundColor: '#FF8A32',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 24,
  },
  saveDisabled: {
    opacity: 0.7,
  },
  saveText: {
    color: '#081426',
    fontSize: 16,
    fontWeight: '700',
  },
});