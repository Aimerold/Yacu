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
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AccountError,
  resendSignupCode,
  verifySignupCode,
} from '@/services/auth.service';

const RESEND_DELAY_SECONDS = 60;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_DELAY_SECONDS);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    const timer =
      cooldown > 0
        ? setTimeout(() => setCooldown((value) => value - 1), 1000)
        : null;

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [cooldown]);

  async function handleSubmit() {
    if (loading || !email) return;

    const cleanCode = code.trim();

    if (!/^\d{6,10}$/.test(cleanCode)) {
      setError('Saisis le code reçu par e-mail (chiffres uniquement).');
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');

    try {
      await verifySignupCode({ email, code: cleanCode });
      router.replace('/');
    } catch (e) {
      setError(
        e instanceof AccountError ? e.message : 'Impossible de confirmer ton e-mail.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email || resending || cooldown > 0) return;

    setResending(true);
    setError('');
    setInfo('');

    try {
      await resendSignupCode(email);
      setCooldown(RESEND_DELAY_SECONDS);
      setInfo('Un nouveau code vient d’être envoyé.');
    } catch (e) {
      setError(
        e instanceof AccountError ? e.message : "Impossible d'envoyer le code."
      );
    } finally {
      setResending(false);
    }
  }

  if (!email) {
    return (
      <View style={styles.flex}>
        <View style={styles.content}>
          <Text style={styles.title}>Adresse manquante</Text>
          <Text style={styles.subtitle}>
            Reviens à l'écran de connexion et recommence.
          </Text>
          <Pressable style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Retour</Text>
          </Pressable>
        </View>
      </View>
    );
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

        <Text style={styles.title}>Confirme ton e-mail</Text>
        <Text style={styles.subtitle}>
          Nous avons envoyé un code à {email}. Saisis-le ci-dessous pour activer
          ton compte.
        </Text>

        <Text style={styles.label}>Code de confirmation</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor="#8493A8"
          keyboardType="number-pad"
          maxLength={10}
          editable={!loading}
          onSubmitEditing={handleSubmit}
        />

        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!info && <Text style={styles.info}>{info}</Text>}

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#081426" />
          ) : (
            <Text style={styles.buttonText}>Confirmer</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.resend}
          onPress={handleResend}
          disabled={cooldown > 0 || resending}
        >
          <Text
            style={[
              styles.resendText,
              (cooldown > 0 || resending) && styles.resendDisabled,
            ]}
          >
            {cooldown > 0
              ? `Renvoyer le code dans ${cooldown} s`
              : 'Renvoyer le code'}
          </Text>
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
    marginBottom: 20,
  },
  label: {
    color: '#A8B6C8',
    fontSize: 13,
    marginBottom: 8,
    marginTop: 12,
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
  info: {
    color: '#A8B6C8',
    marginTop: 14,
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
  resend: {
    alignItems: 'center',
    marginTop: 18,
    padding: 8,
  },
  resendText: {
    color: '#FF8A32',
    fontWeight: '600',
  },
  resendDisabled: {
    color: '#8493A8',
  },
});