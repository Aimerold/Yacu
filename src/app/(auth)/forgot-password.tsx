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
import { useRouter } from 'expo-router';
import {
  AccountError,
  isValidEmail,
  requestPasswordReset,
} from '@/services/auth.service';

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (loading) return;

    if (!isValidEmail(email)) {
      setError('Saisis une adresse e-mail valide.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await requestPasswordReset(email);

      router.push({
        pathname: '/reset-password',
        params: { email: email.trim().toLowerCase() },
      });
    } catch (e) {
      setError(
        e instanceof AccountError ? e.message : "Impossible d'envoyer le code."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>← Retour à la connexion</Text>
        </Pressable>

        <Text style={styles.title}>Mot de passe oublié</Text>
        <Text style={styles.subtitle}>
          Saisis l'adresse e-mail de ton compte. Nous t'enverrons un code pour
          choisir un nouveau mot de passe.
        </Text>

        <Text style={styles.label}>Adresse e-mail</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="toi@exemple.com"
          placeholderTextColor="#8493A8"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!loading}
          onSubmitEditing={handleSubmit}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#081426" />
          ) : (
            <Text style={styles.buttonText}>Envoyer le code</Text>
          )}
        </Pressable>
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
  },
  subtitle: {
    color: '#A8B6C8',
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 24,
  },
  label: {
    color: '#A8B6C8',
    fontSize: 13,
    marginBottom: 8,
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
    marginTop: 14,
    lineHeight: 20,
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