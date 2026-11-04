import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getProfileById } from '@/services/profile.service';
import type { Profile } from '@/services/profile.service';
import { createDirectConversation } from '@/services/conversation.service';
import {
  blockUser,
  isUserBlocked,
  unblockUser,
} from '@/services/block.service';
import { reportUser } from '@/services/report.service';
import type { ReportReason } from '@/services/report.service';
import ReportModal from '@/components/ui/ReportModal';

export default function UserProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        if (!id) throw new Error('Identifiant du profil manquant.');

        const [result, sessionResult, blocked] = await Promise.all([
          getProfileById(id),
          supabase.auth.getSession(),
          isUserBlocked(id).catch(() => false),
        ]);

        if (!active) return;

        setProfile(result);
        setMyId(sessionResult.data.session?.user.id ?? null);
        setBlockedByMe(blocked);
      } catch (e) {
        console.error('Erreur de chargement du profil :', e);
        if (active) setError('Impossible de charger ce profil.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [id]);

  async function handleStartConversation() {
    if (!id || starting) return;

    setStarting(true);
    setActionError('');

    try {
      const conversationId = await createDirectConversation(id);

      router.push({
        pathname: '/chat/[conversationId]',
        params: { conversationId },
      });
    } catch (e) {
      console.error('Erreur de création de conversation :', e);
      setActionError("Impossible d'ouvrir la conversation. Réessaie.");
    } finally {
      setStarting(false);
    }
  }

  async function handleBlock() {
    if (!id || busy) return;

    setBusy(true);
    setActionError('');

    try {
      await blockUser(id);
      setBlockedByMe(true);
      setConfirmBlock(false);
      setInfo('Utilisateur bloqué.');
    } catch {
      setActionError('Impossible de bloquer cet utilisateur. Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnblock() {
    if (!id || busy) return;

    setBusy(true);
    setActionError('');

    try {
      await unblockUser(id);
      setBlockedByMe(false);
      setInfo('Utilisateur débloqué.');
    } catch {
      setActionError('Impossible de débloquer cet utilisateur. Réessaie.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReport(reason: ReportReason, details: string) {
    if (!id) return;

    await reportUser({ reportedUserId: id, reason, details });
    setInfo('Signalement envoyé. Merci.');
  }

  const isMe = !!myId && myId === id;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Retour</Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator color="#FF8A32" size="large" />
      ) : profile ? (
        <View>
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

            {!isMe && !blockedByMe && (
              <Pressable
                style={[styles.button, starting && styles.buttonDisabled]}
                onPress={handleStartConversation}
                disabled={starting}
              >
                {starting ? (
                  <ActivityIndicator color="#081426" />
                ) : (
                  <Text style={styles.buttonText}>Envoyer un message</Text>
                )}
              </Pressable>
            )}

            {!isMe && blockedByMe && (
              <Text style={styles.blockedNotice}>
                Tu as bloqué cet utilisateur.
              </Text>
            )}
          </View>

          {!isMe && (
            <View style={styles.moderation}>
              {confirmBlock ? (
                <View style={styles.confirmBox}>
                  <Text style={styles.confirmText}>
                    Bloquer @{profile.username} ? Vous ne pourrez plus vous
                    envoyer de messages.
                  </Text>

                  <View style={styles.confirmActions}>
                    <Pressable
                      style={[styles.smallButton, styles.neutralButton]}
                      onPress={() => setConfirmBlock(false)}
                      disabled={busy}
                    >
                      <Text style={styles.neutralText}>Annuler</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.smallButton, styles.dangerButton]}
                      onPress={handleBlock}
                      disabled={busy}
                    >
                      {busy ? (
                        <ActivityIndicator color="#081426" />
                      ) : (
                        <Text style={styles.dangerText}>Bloquer</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.moderationRow}>
                  {blockedByMe ? (
                    <Pressable
                      style={[styles.outlineButton, busy && styles.buttonDisabled]}
                      onPress={handleUnblock}
                      disabled={busy}
                    >
                      <Text style={styles.outlineText}>Débloquer</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.outlineButton}
                      onPress={() => {
                        setInfo('');
                        setConfirmBlock(true);
                      }}
                    >
                      <Text style={styles.outlineText}>Bloquer</Text>
                    </Pressable>
                  )}

                  <Pressable
                    style={styles.outlineButton}
                    onPress={() => {
                      setInfo('');
                      setReportOpen(true);
                    }}
                  >
                    <Text style={styles.outlineText}>Signaler</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {!!info && <Text style={styles.info}>{info}</Text>}
          {!!actionError && <Text style={styles.error}>{actionError}</Text>}

          <ReportModal
            visible={reportOpen}
            username={profile.username}
            onClose={() => setReportOpen(false)}
            onSubmit={handleReport}
          />
        </View>
      ) : (
        <Text style={styles.error}>{error}</Text>
      )}
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
  button: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: '#FF8A32',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 26,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#081426',
    fontSize: 16,
    fontWeight: '700',
  },
  blockedNotice: {
    color: '#A8B6C8',
    marginTop: 22,
  },
  moderation: {
    marginTop: 18,
  },
  moderationRow: {
    flexDirection: 'row',
    gap: 12,
  },
  outlineButton: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#263A54',
    borderRadius: 12,
    paddingVertical: 12,
  },
  outlineText: {
    color: '#C1CCDA',
    fontWeight: '600',
  },
  confirmBox: {
    backgroundColor: '#10223A',
    borderRadius: 14,
    padding: 16,
  },
  confirmText: {
    color: '#FFFFFF',
    lineHeight: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
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
  info: {
    color: '#A8B6C8',
    textAlign: 'center',
    marginTop: 16,
  },
  error: {
    color: '#FF8A32',
    marginTop: 16,
    textAlign: 'center',
  },
});