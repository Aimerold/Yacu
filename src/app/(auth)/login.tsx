import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { resendSignupCode } from '@/services/auth.service';
import {
  registerForPushNotificationsAsync,
  savePushToken,
} from '@/lib/notifications';

const C = {
  background: '#081426',
  surface: '#10223A',
  input: '#172B45',
  orange: '#FF8A32',
  white: '#FFFFFF',
  muted: '#A8B6C8',
};

function friendlyAuthError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Une erreur est survenue.';
  }

  const text = error.message.toLowerCase();

  if (text.includes('invalid login credentials')) {
    return 'E-mail ou mot de passe incorrect.';
  }

  if (
    text.includes('already registered') ||
    text.includes('already been registered')
  ) {
    return 'Cette adresse e-mail possède peut-être déjà un compte Yacu. Utilise « Se connecter » ou « Mot de passe oublié ».';
  }

  if (text.includes('database error saving new user')) {
    return "Création impossible : ce nom d'utilisateur est peut-être déjà pris.";
  }

  if (
    text.includes('rate limit') ||
    text.includes('security purposes')
  ) {
    return 'Trop de tentatives. Réessaie dans quelques minutes.';
  }

  if (text.includes('network') || text.includes('fetch')) {
    return 'Connexion impossible. Vérifie ton réseau.';
  }

  return error.message;
}

/**
 * Enregistre le token de notification pour l'utilisateur connecté.
 * Un échec n'empêche jamais la connexion de fonctionner.
 */
async function registerPushTokenForCurrentUser() {
  try {
    const token = await registerForPushNotificationsAsync();

    if (!token) return;

    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;

    if (userId) {
      await savePushToken(userId, token);
    }
  } catch (error) {
    console.error(
      '[Yacu Notifications] Enregistrement du token échoué :',
      error
    );
  }
}

export default function HomeScreen() {
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionActive, setSessionActive] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        setMessage(error.message);
      }

      setSessionActive(!!data.session);
      setCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) {
          setSessionActive(!!session);
        }
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleAuth() {
    if (loading) return;

    setMessage('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setMessage('Remplis ton adresse e-mail et ton mot de passe.');
      return;
    }

    if (password.length < 8) {
      setMessage(
        'Le mot de passe doit contenir au moins 8 caractères.'
      );
      return;
    }

    if (mode === 'signup') {
      if (!cleanUsername) {
        setMessage("Saisis un nom d'utilisateur.");
        return;
      }

      if (cleanUsername.length < 3) {
        setMessage(
          "Le nom d'utilisateur doit contenir au moins 3 caractères."
        );
        return;
      }

      if (cleanUsername.length > 20) {
        setMessage(
          "Le nom d'utilisateur ne peut pas dépasser 20 caractères."
        );
        return;
      }

      if (/\s/.test(cleanUsername)) {
        setMessage(
          "Le nom d'utilisateur ne doit pas contenir d'espace. Utilise _ pour séparer les mots."
        );
        return;
      }

      if (cleanUsername.includes('@')) {
        setMessage(
          "Saisis ton nom d'utilisateur sans le symbole @."
        );
        return;
      }

      if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
        setMessage(
          "Le nom d'utilisateur accepte uniquement les lettres de a à z, les chiffres et _. Les accents, points et tirets ne sont pas autorisés."
        );
        return;
      }

      if (!displayName.trim()) {
        setMessage('Saisis ton nom complet.');
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) throw error;

        await registerPushTokenForCurrentUser();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              username: cleanUsername,
              display_name: displayName.trim(),
            },
          },
        });

        if (error) {
          const signUpMessage = error.message.toLowerCase();

          if (
            signUpMessage.includes('user already registered') ||
            signUpMessage.includes('already registered') ||
            signUpMessage.includes('already been registered')
          ) {
            setMessage(
              'Cette adresse e-mail possède peut-être déjà un compte Yacu. Utilise « Se connecter » ou « Mot de passe oublié ».'
            );

            return;
          }

          throw error;
        }

        if (!data.session) {
          router.push({
            pathname: '/verify-email',
            params: { email: cleanEmail },
          });
        } else {
          setMessage('Ton compte Yacu a été créé avec succès.');

          await registerPushTokenForCurrentUser();
        }
      }
    } catch (error: unknown) {
      const notConfirmed =
        mode === 'login' &&
        error instanceof Error &&
        error.message.toLowerCase().includes('email not confirmed');

      if (notConfirmed) {
        await resendSignupCode(cleanEmail).catch(() => undefined);

        router.push({
          pathname: '/verify-email',
          params: { email: cleanEmail },
        });
      } else {
        setMessage(friendlyAuthError(error));
      }
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={C.orange} />
        <Text style={styles.muted}>Chargement de Yacu...</Text>
      </View>
    );
  }

  if (sessionActive) {
    return <Redirect href="/(app)/(tabs)/chats" />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.brand}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoLetter}>Y</Text>
            </View>

            <Text style={styles.logo}>YACU</Text>

            <Text style={styles.muted}>
              Reste proche de ceux qui comptent.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.heading}>
              {mode === 'login'
                ? 'Content de te revoir'
                : 'Rejoins Yacu'}
            </Text>

            <Text style={styles.muted}>
              {mode === 'login'
                ? 'Connecte-toi pour retrouver tes amis.'
                : 'Crée ton compte et commence à discuter.'}
            </Text>

            {mode === 'signup' && (
              <>
                <Text style={styles.label}>Nom complet</Text>

                <TextInput
                  style={styles.input}
                  placeholder="Ton Nom au Complet"
                  placeholderTextColor={C.muted}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                />

                <Text style={styles.label}>Nom d'utilisateur</Text>

                <TextInput
                  style={styles.input}
                  placeholder="exemple : Aimeroldbouanga en un seul mot"
                  placeholderTextColor={C.muted}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.usernameHint}>
                  De 3 à 20 caractères : lettres sans accent,
                  chiffres et _. Sans espace ni @.
                </Text>
              </>
            )}

            <Text style={styles.label}>Adresse e-mail</Text>

            <TextInput
              style={styles.input}
              placeholder="exemple@email.com"
              placeholderTextColor={C.muted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Mot de passe</Text>

            <TextInput
              style={styles.input}
              placeholder="Minimum 8 caractères"
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            {mode === 'login' && (
              <Pressable
                style={styles.forgot}
                onPress={() => router.push('/forgot-password')}
                hitSlop={8}
              >
                <Text style={styles.switchLink}>
                  Mot de passe oublié ?
                </Text>
              </Pressable>
            )}

            {!!message && (
              <Text style={styles.message}>{message}</Text>
            )}

            <Pressable
              style={[
                styles.button,
                loading && styles.disabled,
              ]}
              onPress={handleAuth}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={styles.buttonText}>
                  {mode === 'login'
                    ? 'Se connecter'
                    : 'Créer mon compte'}
                </Text>
              )}
            </Pressable>

            <View style={styles.switchRow}>
              <Text style={styles.muted}>
                {mode === 'login'
                  ? 'Tu n’as pas encore de compte ?'
                  : 'Tu as déjà un compte ?'}
              </Text>

              <Pressable
                onPress={() => {
                  setMode(
                    mode === 'login' ? 'signup' : 'login'
                  );
                  setMessage('');
                }}
              >
                <Text style={styles.switchLink}>
                  {mode === 'login'
                    ? ' S’inscrire'
                    : ' Se connecter'}
                </Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.footer}>
            Yacu · Connectés, partout.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  brand: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: C.orange,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoLetter: {
    color: C.white,
    fontSize: 38,
    fontWeight: '900',
  },
  logo: {
    color: C.white,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 5,
  },
  card: {
    backgroundColor: C.surface,
    padding: 24,
    borderRadius: 22,
  },
  heading: {
    color: C.white,
    fontSize: 25,
    fontWeight: '800',
    marginBottom: 8,
  },
  muted: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  label: {
    color: C.white,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: C.input,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 14,
    color: C.white,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#263C57',
  },
  usernameHint: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  forgot: {
    alignSelf: 'flex-end',
    marginTop: 12,
  },
  message: {
    color: C.orange,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 16,
  },
  button: {
    backgroundColor: C.orange,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 22,
  },
  buttonText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.6,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 22,
  },
  switchLink: {
    color: C.orange,
    fontSize: 13,
    fontWeight: '800',
  },
  footer: {
    textAlign: 'center',
    color: C.muted,
    marginTop: 26,
    fontSize: 12,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: C.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});