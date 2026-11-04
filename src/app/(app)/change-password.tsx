import { useState } from 'react';
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
import {
  AccountError,
  PASSWORD_MIN_LENGTH,
  changePassword,
} from '@/services/auth.service';

export default function ChangePasswordScreen() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (saving) return;

    if (!currentPassword) {
      setError('Saisis ton mot de passe actuel.');
      return;
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(
        `Le nouveau mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`
      );
      return;
    }

    if (newPassword !== confirm) {
      setError('Les deux mots de passe ne sont pas identiques.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setDone(true);
    } catch (e) {
      setError(
        e instanceof AccountError
          ? e.message
          : 'Impossible de modifier le mot de passe. Réessaie.'
      );
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
          <Text style={styles.back}>← Retour</Text>
        </Pressable>

        <Text style={styles.title}>Changer le mot de passe</Text>

        {done ? (
          <View>
            <Text style={styles.success}>
              Ton mot de passe a bien été modifié.
            </Text>
            <Pressable style={styles.button} onPress={() => router.back()}>
              <Text style={styles.buttonText}>Retour</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <Text style={styles.label}>Mot de passe actuel</Text>
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
            />

            <Text style={styles.label}>Nouveau mot de passe</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={`${PASSWORD_MIN_LENGTH} caractères minimum`}
              placeholderTextColor="#8493A8"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
            />

            <Text style={styles.label}>Confirmer le nouveau mot de passe</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
              onSubmitEditing={handleSave}
            />

            {!!error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.button, saving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#081426" />
              ) : (
                <Text style={styles.buttonText}>Enregistrer</Text>
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
    marginBottom: 30,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
  label: {
    color: '#A8B6C8',
    fontSize: 13,
    marginBottom: 8,
    marginTop: 14,
  },
  input: {
    backgroundColor: '#10223A',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#263A54',
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  error: {
    color: '#FF8A32',
    marginTop: 16,
    lineHeight: 20,
  },
  success: {
    color: '#A8B6C8',
    lineHeight: 21,
    marginTop: 10,
  },
  button: {
    backgroundColor: '#FF8A32',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#081426',
    fontSize: 16,
    fontWeight: '700',
  },
});