import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import AppHeader from '@/components/layout/AppHeader';
import Avatar from '@/components/ui/Avatar';
import { invalidateMyProfile, useMyProfile } from '@/hooks/useMyProfile';
import { useUserSettings } from '@/hooks/useUserSettings';
import {
  AccountError,
  deleteMyAccount,
  getCurrentEmail,
  signOut,
} from '@/services/auth.service';
import { pickAvatar, removeAvatar, setAvatar } from '@/services/avatar.service';
import { MediaError } from '@/services/media.service';
import { getMemberSince } from '@/services/profile-meta.service';
import { formatMemberSince } from '@/utils/format';
import { colors } from '@/theme/tokens';

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

type ToggleRowProps = {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

function ToggleRow({ label, hint, value, onValueChange }: ToggleRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor={colors.text}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const profile = useMyProfile();
  const {
    settings,
    loading: settingsLoading,
    error: settingsError,
    update: updateSettings,
    reload: reloadSettings,
  } = useUserSettings();

  const [email, setEmail] = useState<string | null>(null);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarInfo, setAvatarInfo] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const profileId = profile?.id;

  useEffect(() => {
    let active = true;

    getCurrentEmail().then((value) => {
      if (active) setEmail(value);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (profileId) {
      getMemberSince(profileId)
        .then((value) => {
          if (active) setMemberSince(value);
        })
        .catch(() => undefined);
    }

    return () => {
      active = false;
    };
  }, [profileId]);

  async function handleChangeAvatar(source: 'library' | 'camera') {
    if (avatarBusy) return;

    setAvatarError('');
    setAvatarInfo('');

    try {
      const prepared = await pickAvatar(source);

      if (!prepared) return;

      setAvatarBusy(true);
      await setAvatar(prepared);
      invalidateMyProfile();
      setAvatarInfo('Photo de profil mise à jour.');
    } catch (e) {
      setAvatarError(
        e instanceof MediaError
          ? e.message
          : 'Impossible de mettre à jour la photo. Réessaie.'
      );
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleRemoveAvatar() {
    if (avatarBusy) return;

    setAvatarError('');
    setAvatarInfo('');
    setAvatarBusy(true);

    try {
      await removeAvatar();
      invalidateMyProfile();
      setAvatarInfo('Photo de profil supprimée.');
    } catch (e) {
      setAvatarError(
        e instanceof MediaError
          ? e.message
          : 'Impossible de supprimer la photo. Réessaie.'
      );
    } finally {
      setAvatarBusy(false);
    }
  }

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

  const name = profile?.display_name || profile?.username || '';

  return (
    <View style={styles.container}>
      <AppHeader />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Paramètres</Text>

        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Avatar name={name} uri={profile?.avatar_url} size={72} />
            {avatarBusy && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color={colors.accent} />
              </View>
            )}
          </View>

          {profile ? (
            <>
              <Text style={styles.profileName}>{name}</Text>
              <Text style={styles.profileUsername}>@{profile.username}</Text>
              {!!profile.bio && (
                <Text style={styles.profileBio}>{profile.bio}</Text>
              )}
              {!!memberSince && (
                <Text style={styles.memberSince}>
                  {formatMemberSince(memberSince)}
                </Text>
              )}
            </>
          ) : (
            <ActivityIndicator color={colors.accent} style={styles.profileLoader} />
          )}

          <Pressable
            style={styles.editButton}
            onPress={() => router.push('/(app)/profile-edit')}
          >
            <Text style={styles.editButtonText}>Modifier mon profil</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>Photo de profil</Text>
        <View style={styles.group}>
          <SettingsRow
            label="Choisir dans la galerie"
            onPress={() => handleChangeAvatar('library')}
          />

          {Platform.OS !== 'web' && (
            <SettingsRow
              label="Prendre une photo"
              onPress={() => handleChangeAvatar('camera')}
            />
          )}

          {!!profile?.avatar_url && (
            <Pressable
              style={styles.row}
              onPress={handleRemoveAvatar}
              disabled={avatarBusy}
            >
              <Text style={styles.dangerLabel}>Supprimer la photo</Text>
            </Pressable>
          )}
        </View>

        {!!avatarInfo && <Text style={styles.info}>{avatarInfo}</Text>}
        {!!avatarError && <Text style={styles.error}>{avatarError}</Text>}

        <Text style={styles.section}>Compte</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Adresse e-mail</Text>
              <Text style={styles.rowHint}>{email ?? '—'}</Text>
            </View>
          </View>

          <SettingsRow
            label="Changer le mot de passe"
            onPress={() => router.push('/(app)/change-password')}
          />
        </View>

        <Text style={styles.section}>Confidentialité</Text>
        <View style={styles.group}>
          {settings ? (
            <>
              <ToggleRow
                label="Dernière activité"
                hint="Si tu la masques, tu ne verras pas non plus celle des autres."
                value={settings.show_last_seen}
                onValueChange={(value) => updateSettings({ show_last_seen: value })}
              />
              <ToggleRow
                label="Présence en ligne"
                hint="Montre quand tu es en ligne."
                value={settings.show_online_status}
                onValueChange={(value) =>
                  updateSettings({ show_online_status: value })
                }
              />
              <ToggleRow
                label="Indicateur de saisie"
                hint="Montre « en train d'écrire… » pendant que tu écris."
                value={settings.typing_indicator_enabled}
                onValueChange={(value) =>
                  updateSettings({ typing_indicator_enabled: value })
                }
              />
              <ToggleRow
                label="Confirmations de lecture"
                hint="Si tu les désactives, les autres ne voient pas quand tu as lu leurs messages."
                value={settings.read_receipts_enabled}
                onValueChange={(value) =>
                  updateSettings({ read_receipts_enabled: value })
                }
              />
            </>
          ) : settingsLoading ? (
            <View style={styles.row}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <Pressable style={styles.row} onPress={reloadSettings}>
              <Text style={styles.rowLabel}>Réessayer de charger les réglages</Text>
            </Pressable>
          )}

          <SettingsRow
            label="Utilisateurs bloqués"
            hint="Gère les personnes que tu as bloquées"
            onPress={() => router.push('/(app)/blocked-users')}
          />
        </View>

        {!!settingsError && <Text style={styles.error}>{settingsError}</Text>}

        <Text style={styles.section}>Notifications</Text>
        <View style={styles.group}>
          {settings ? (
            <ToggleRow
              label="Notifications push"
              hint="Ton choix est enregistré et s'appliquera dès l'arrivée des notifications."
              value={settings.push_notifications_enabled}
              onValueChange={(value) =>
                updateSettings({ push_notifications_enabled: value })
              }
            />
          ) : (
            <View style={styles.row}>
              <Text style={styles.rowHint}>
                {settingsLoading ? 'Chargement…' : 'Indisponible'}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.section}>Session</Text>
        <View style={styles.group}>
          <Pressable
            style={styles.row}
            onPress={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <ActivityIndicator color={colors.accent} />
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
                    <ActivityIndicator color={colors.onAccent} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 40,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 18,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 22,
  },
  avatarWrap: {
    width: 72,
    height: 72,
  },
 avatarOverlay: {
  ...StyleSheet.absoluteFill,
  borderRadius: 36,
  backgroundColor: 'rgba(8,20,38,0.6)',
  alignItems: 'center',
  justifyContent: 'center',
},
  profileLoader: {
    marginTop: 18,
  },
  profileName: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
    marginTop: 14,
  },
  profileUsername: {
    color: colors.accent,
    marginTop: 5,
  },
  profileBio: {
    color: colors.textBody,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  memberSince: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 12,
  },
  editButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  editButtonText: {
    color: colors.onAccent,
    fontWeight: '700',
  },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 26,
    marginBottom: 10,
  },
  group: {
    backgroundColor: colors.surface,
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
    borderBottomColor: colors.border,
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    color: colors.text,
    fontSize: 15,
  },
  rowHint: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 22,
    marginLeft: 8,
  },
  info: {
    color: colors.textSecondary,
    marginTop: 12,
    lineHeight: 20,
  },
  error: {
    color: colors.accent,
    marginTop: 12,
    lineHeight: 20,
  },
  dangerLabel: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  deletePanel: {
    padding: 16,
  },
  deleteTitle: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  deleteText: {
    color: colors.textBody,
    lineHeight: 20,
    marginTop: 8,
  },
  deleteLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.input,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.border,
  },
  neutralText: {
    color: colors.text,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: colors.accent,
  },
  dangerText: {
    color: colors.onAccent,
    fontWeight: '700',
  },
});