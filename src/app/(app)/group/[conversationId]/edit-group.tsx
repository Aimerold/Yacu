import AppHeader from '@/components/layout/AppHeader';
import { getGroupById } from '@/services/conversation.service';
import { updateGroup } from '@/services/group.service';
import { colors } from '@/theme/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function EditGroupScreen() {
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{
    conversationId: string;
  }>();

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!conversationId) {
      throw new Error('Identifiant du groupe introuvable.');
    }

    const group = await getGroupById(conversationId);

    if (!group) {
      throw new Error('Groupe introuvable ou accès refusé.');
    }

    return group.name ?? '';
  }, [conversationId]);

  useEffect(() => {
    let active = true;

    load()
      .then((groupName) => {
        if (active) {
          setName(groupName);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (!active) return;

        const message =
          e instanceof Error
            ? e.message
            : 'Impossible de charger le groupe.';

        setError(message);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [load]);

  async function handleSave() {
    if (!conversationId) return;

    const trimmedName = name.trim();

    if (trimmedName.length < 2) {
      setError('Le nom du groupe doit contenir au moins 2 caractères.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      await updateGroup(conversationId, trimmedName, null);

      router.back();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Impossible de modifier le groupe.';

      setError(message);
      Alert.alert('Erreur', message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <AppHeader />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Modifier le groupe</Text>

          {loading ? (
            <ActivityIndicator color={colors.accent} size="large" />
          ) : (
            <>
              <Text style={styles.label}>Nom du groupe</Text>
              <TextInput
                style={styles.input}
                placeholder="Nom du groupe"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
                maxLength={50}
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.saveButton, saving && styles.disabledButton]}
                onPress={handleSave}
                disabled={saving}
                accessibilityLabel="Enregistrer les modifications"
              >
                {saving ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.saveButtonText}>Enregistrer</Text>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 140,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 20,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    color: colors.text,
    paddingHorizontal: 14,
    minHeight: 48,
    marginBottom: 20,
  },
  error: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
});
