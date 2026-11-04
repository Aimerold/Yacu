import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  AccountError,
  deleteMyAccount,
  getCurrentEmail,
  signOut,
} from '@/services/auth.service';

type RowProps = {
  label: string;
  hint?: string;
  onPress: () => void;
};

function SettingsRow({ label, hint, onPress }: RowProps) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    let active = true;

    getCurrentEmail().then((value) => {
      if (active) setEmail(value);
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    setError('');

    try {
      await signOut();
      router.replace('/');
    } catch {
      setError('Impossible de se déconnecter. Réessaie.');
      setLoggingOut(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;

    if (!password) {
      setDeleteError('Saisis ton mot de passe pour confirmer.');
      return;
    }

    setDeleting(true);
    setDeleteError('');

    try {
      await deleteMyAccount(password);
      router.replace('/');
    } catch (e) {
      setDeleteError(
        e instanceof AccountError
          ? e.message
          : 'Suppression impossible pour le moment. Réessaie plus tard.'
      );
      setDeleting(false);
    }
  }

  function closeDeletePanel() {
    if (deleting) return;

    setDeleteOpen(false);
    setPassword('');
    setDeleteError('');
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ headerShown: false }} />

      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.back}>← Retour</Text>
      </Pressable>

      <Text style={styles.title}>Paramètres</Text>

      <Text style={styles.section}>Compte</Text>
      <View style={styles.group}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Adresse e-mail</Text>
            <Text style={styles.rowHint}>{email ?? '—'}</Text>
          </View>
        </View>

        <SettingsRow
          label="Modifier mon profil"
          onPress={() => router.push('/(app)/profile-edit')}
        />
        <SettingsRow
          label="Changer le mot de passe"
          onPress={() => router.push('/(app)/change-password')}
        />
      </View>

      <Text style={styles.section}>Confidentialité</Text>
      <View style={styles.group}>
        <SettingsRow
          label="Utilisateurs bloqués"
          hint="Gère les personnes que tu as bloquées"
          onPress={() => router.push('/(app)/blocked-users')}
        />
      </View>

      <Text style={styles.section}>Session</Text>
      <View style={styles.group}>
        <Pressable style={styles.row} onPress={handleLogout} disabled={loggingOut}>
          {loggingOut ? (
            <ActivityIndicator color="#FF8A32" />
          ) : (
            <Text style={styles.rowLabel}>Se déconnecter</Text>
          )}
        </Pressable>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.section}>Zone sensible</Text>
      <View style={styles.group}>
        {deleteOpen ? (
          <View style={styles.deletePanel}>
            <Text style={styles.deleteTitle}>Supprimer mon compte</Text>
            <Text style={styles.deleteText}>
              Cette action est définitive. Ton profil, tes conversations, tes
              messages et tes photos seront supprimés, y compris pour les
              personnes avec qui tu discutes.
            </Text>

            <Text style={styles.deleteLabel}>
              Saisis ton mot de passe pour confirmer
            </Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!deleting}
            />

            {!!deleteError && <Text style={styles.error}>{deleteError}</Text>}

            <View style={styles.deleteActions}>
              <Pressable
                style={[styles.smallButton, styles.neutralButton]}
                onPress={closeDeletePanel}
                disabled={deleting}
              >
                <Text style={styles.neutralText}>Annuler</Text>
              </Pressable>

              <Pressable
                style={[styles.smallButton, styles.dangerButton]}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#081426" />
                ) : (
                  <Text style={styles.dangerText}>Supprimer</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.row} onPress={() => setDeleteOpen(true)}>
            <Text style={styles.dangerLabel}>Supprimer mon compte</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#081426',
  },
  content: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 50,
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
    marginBottom: 8,
  },
  section: {
    color: '#8493A8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 26,
    marginBottom: 10,
  },
  group: {
    backgroundColor: '#10223A',
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#263A54',
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  rowHint: {
    color: '#A8B6C8',
    fontSize: 13,
    marginTop: 3,
  },
  chevron: {
    color: '#8493A8',
    fontSize: 22,
    marginLeft: 8,
  },
  error: {
    color: '#FF8A32',
    marginTop: 12,
    lineHeight: 20,
  },
  dangerLabel: {
    color: '#FF8A32',
    fontSize: 15,
    fontWeight: '600',
  },
  deletePanel: {
    padding: 16,
  },
  deleteTitle: {
    color: '#FF8A32',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteText: {
    color: '#C1CCDA',
    lineHeight: 20,
    marginTop: 8,
  },
  deleteLabel: {
    color: '#A8B6C8',
    fontSize: 13,
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#172B45',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#263A54',
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  smallButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 12,
  },
  neutralButton: {
    backgroundColor: '#263A54',
  },
  neutralText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#FF8A32',
  },
  dangerText: {
    color: '#081426',
    fontWeight: '700',
  },
});