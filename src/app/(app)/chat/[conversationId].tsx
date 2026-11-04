import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  getConversationById,
  getCurrentUserId,
} from '@/services/conversation.service';
import type { ConversationSummary } from '@/services/conversation.service';
import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_PAGE_SIZE,
  getMessages,
  markConversationRead,
  sendImageMessage,
  sendTextMessage,
  subscribeToConversationMessages,
} from '@/services/message.service';
import type { Message } from '@/services/message.service';
import {
  MediaError,
  buildChatImagePath,
  pickImageFromLibrary,
  takePhoto,
  uploadChatImage,
} from '@/services/media.service';
import type { PreparedImage } from '@/services/media.service';
import { isUserBlocked, unblockUser } from '@/services/block.service';
import ImageMessage from '@/features/messages/components/ImageMessage';
import ImageViewerModal from '@/features/messages/components/ImageViewerModal';
import type { ViewerTarget } from '@/features/messages/components/ImageViewerModal';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { generateId } from '@/utils/id';
import { formatMessageTime } from '@/utils/format';

/**
 * Décalage du clavier : UN SEUL mécanisme, KeyboardAvoidingView.
 * Avec l'affichage bord à bord d'Expo/Android récents, le système ne redimensionne
 * plus la fenêtre : 'padding' est nécessaire sur Android comme sur iOS.
 * Si un espace vide apparaît au-dessus du clavier sur Android (la fenêtre est alors
 * déjà redimensionnée par le système), remplacer par `undefined` pour Android.
 */
const KEYBOARD_BEHAVIOR: 'padding' | undefined = 'padding';

const MIN_INPUT_HEIGHT = 44;
const MAX_INPUT_HEIGHT = 132;
const INPUT_VERTICAL_PADDING = 20;

type ChatMessage = Message & {
  status: 'sent' | 'pending' | 'failed';
  /** Aperçu local d'une photo en cours d'envoi (évite de la retélécharger). */
  localUri?: string;
};

function timeOf(message: ChatMessage): number {
  const value = Date.parse(message.created_at);
  return Number.isNaN(value) ? 0 : value;
}

/** Fusionne des messages dans la liste (remplace par id) et trie du plus récent au plus ancien. */
function upsertMessages(
  list: ChatMessage[],
  incoming: ChatMessage[]
): ChatMessage[] {
  const byId = new Map(list.map((message) => [message.id, message]));

  for (const message of incoming) {
    const existing = byId.get(message.id);

    byId.set(message.id, {
      ...message,
      localUri: message.localUri ?? existing?.localUri,
    });
  }

  return Array.from(byId.values()).sort((a, b) => timeOf(b) - timeOf(a));
}

/** L'envoi est refusé par la base (blocage ou accès retiré). */
function isPermissionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes('row-level security')
  );
}

export default function ConversationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();

  const [conversation, setConversation] = useState<ConversationSummary | null>(
    null
  );
  const [myId, setMyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const [draftImage, setDraftImage] = useState<PreparedImage | null>(null);
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [connected, setConnected] = useState(true);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  /** Photos en attente d'envoi (conservées pour un éventuel « Réessayer »). */
  const pendingImages = useRef(new Map<string, PreparedImage>());

  /** Marge basse : zone de sécurité quand le clavier est fermé, petite marge quand il est ouvert. */
  const bottomPadding = keyboardVisible ? 8 : Math.max(insets.bottom, 8) + 8;

  const markRead = useCallback(() => {
    if (!conversationId) return;
    // Non critique : en cas d'échec, le compteur sera corrigé à la prochaine ouverture.
    markConversationRead(conversationId).catch(() => undefined);
  }, [conversationId]);

  /** Récupère les derniers messages et les fusionne (utilisé à la reconnexion). */
  const syncLatest = useCallback(async () => {
    if (!conversationId) return;

    try {
      const latest = await getMessages(conversationId);
      setMessages((previous) =>
        upsertMessages(
          previous,
          latest.map((message) => ({ ...message, status: 'sent' as const }))
        )
      );
      markRead();
    } catch {
      // Réseau coupé : une nouvelle synchronisation aura lieu à la reconnexion.
    }
  }, [conversationId, markRead]);

  // Chargement initial
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        if (!conversationId) throw new Error('Conversation manquante.');

        const [conversationResult, userId, firstPage] = await Promise.all([
          getConversationById(conversationId),
          getCurrentUserId(),
          getMessages(conversationId),
        ]);

        if (!active) return;

        if (!conversationResult) {
          setError('Conversation introuvable ou accès refusé.');
          return;
        }

        const otherId = conversationResult.other_user?.id;
        const blocked = otherId
          ? await isUserBlocked(otherId).catch(() => false)
          : false;

        if (!active) return;

        setConversation(conversationResult);
        setMyId(userId);
        setBlockedByMe(blocked);
        setMessages(
          firstPage.map((message) => ({ ...message, status: 'sent' as const }))
        );
        setHasMore(firstPage.length === MESSAGE_PAGE_SIZE);
        markRead();
      } catch {
        if (active) setError('Impossible de charger cette conversation.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [conversationId, markRead]);

  // Temps réel
  useEffect(() => {
    if (!conversationId) return;

    const unsubscribe = subscribeToConversationMessages(conversationId, {
      onInsert: (message) => {
        setMessages((previous) =>
          upsertMessages(previous, [{ ...message, status: 'sent' }])
        );
        markRead();
      },
      onStatus: (status) => {
        const isConnected = status === 'SUBSCRIBED';
        setConnected(isConnected);

        // (Re)connexion : on récupère les messages éventuellement manqués.
        if (isConnected) {
          void syncLatest();
        }
      },
    });

    return unsubscribe;
  }, [conversationId, markRead, syncLatest]);

  // Retour au premier plan : resynchronisation
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncLatest();
      }
    });

    return () => subscription.remove();
  }, [syncLatest]);

  async function loadOlder() {
    if (!conversationId || loadingMore || !hasMore) return;

    const oldestSent = [...messagesRef.current]
      .reverse()
      .find((message) => message.status === 'sent');

    if (!oldestSent) return;

    setLoadingMore(true);

    try {
      const page = await getMessages(conversationId, oldestSent.created_at);

      setMessages((previous) =>
        upsertMessages(
          previous,
          page.map((message) => ({ ...message, status: 'sent' as const }))
        )
      );
      setHasMore(page.length === MESSAGE_PAGE_SIZE);
    } catch {
      // On pourra réessayer en remontant à nouveau dans la liste.
    } finally {
      setLoadingMore(false);
    }
  }

  /** Envoie un message (texte, ou photo : téléversement puis enregistrement). */
  async function deliver(message: ChatMessage) {
    if (!conversationId) return;

    try {
      let saved: Message;

      if (message.type === 'image') {
        const image = pendingImages.current.get(message.id);

        if (!image || !message.media_path) {
          throw new Error('Photo indisponible.');
        }

        await uploadChatImage(message.media_path, image.base64);

        saved = await sendImageMessage({
          id: message.id,
          conversationId,
          mediaPath: message.media_path,
        });

        pendingImages.current.delete(message.id);
      } else {
        if (!message.content) return;

        saved = await sendTextMessage({
          id: message.id,
          conversationId,
          content: message.content,
        });
      }

      setMessages((previous) =>
        upsertMessages(previous, [
          { ...saved, status: 'sent', localUri: message.localUri },
        ])
      );
    } catch (e) {
      if (isPermissionError(e)) {
        // Refus définitif (blocage) : inutile de proposer « Réessayer ».
        pendingImages.current.delete(message.id);
        setMessages((previous) =>
          previous.filter((item) => item.id !== message.id)
        );
        setNotice("Tu ne peux pas envoyer de message dans cette conversation.");
        return;
      }

      setMessages((previous) =>
        upsertMessages(previous, [{ ...message, status: 'failed' }])
      );
    }
  }

  function handleSend() {
    const content = input.trim();

    if (!content || !conversationId || !myId) return;
    if (content.length > MESSAGE_MAX_LENGTH) return;

    const optimistic: ChatMessage = {
      id: generateId(),
      conversation_id: conversationId,
      sender_id: myId,
      type: 'text',
      content,
      media_path: null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      status: 'pending',
    };

    setNotice('');
    setMessages((previous) => upsertMessages(previous, [optimistic]));
    setInput('');
    setInputHeight(MIN_INPUT_HEIGHT);
    void deliver(optimistic);
  }

  async function handlePickPhoto(source: 'library' | 'camera') {
    setNotice('');

    try {
      const image =
        source === 'camera' ? await takePhoto() : await pickImageFromLibrary();

      if (image) setDraftImage(image);
    } catch (e) {
      setNotice(
        e instanceof MediaError ? e.message : "Impossible d'ajouter la photo."
      );
    }
  }

  function handleSendPhoto() {
    if (!draftImage || !conversationId || !myId) return;

    const id = generateId();

    const optimistic: ChatMessage = {
      id,
      conversation_id: conversationId,
      sender_id: myId,
      type: 'image',
      content: null,
      media_path: buildChatImagePath(conversationId, myId, id),
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      status: 'pending',
      localUri: draftImage.uri,
    };

    pendingImages.current.set(id, draftImage);

    setNotice('');
    setMessages((previous) => upsertMessages(previous, [optimistic]));
    setDraftImage(null);
    void deliver(optimistic);
  }

  function handleRetry(message: ChatMessage) {
    const pending: ChatMessage = { ...message, status: 'pending' };

    setNotice('');
    setMessages((previous) => upsertMessages(previous, [pending]));
    void deliver(pending);
  }

  async function handleUnblock() {
    const otherId = conversation?.other_user?.id;

    if (!otherId) return;

    try {
      await unblockUser(otherId);
      setBlockedByMe(false);
      setNotice('');
    } catch {
      setNotice('Impossible de débloquer cet utilisateur. Réessaie.');
    }
  }

  const name =
    conversation?.other_user?.display_name ||
    conversation?.other_user?.username ||
    'Conversation';

  const canSend = input.trim().length > 0 && !!myId;

  function renderMessage({ item }: { item: ChatMessage }) {
    const mine = item.sender_id === myId;
    const isImage = item.type === 'image';

    return (
      <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
        <View
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
            isImage && styles.bubbleImage,
            item.status === 'pending' && styles.bubblePending,
          ]}
        >
          {isImage ? (
            <ImageMessage
              mediaPath={item.media_path}
              localUri={item.localUri}
              onOpen={() =>
                setViewer({
                  mediaPath: item.media_path,
                  localUri: item.localUri,
                  canDownload: item.status === 'sent',
                })
              }
            />
          ) : (
            <Text style={mine ? styles.textMine : styles.textTheirs}>
              {item.content}
            </Text>
          )}

          <Text
            style={[
              mine ? styles.metaMine : styles.metaTheirs,
              isImage && styles.metaImage,
            ]}
          >
            {formatMessageTime(item.created_at)}
            {mine && item.status === 'pending' ? ' · Envoi…' : ''}
            {mine && item.status === 'sent' ? ' · ✓' : ''}
          </Text>
        </View>

        {mine && item.status === 'failed' && (
          <Pressable onPress={() => handleRetry(item)} hitSlop={8}>
            <Text style={styles.failed}>Échec de l'envoi · Réessayer</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>← Retour</Text>
        </Pressable>

        {conversation && (
          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1}>
              {name}
            </Text>
            {!!conversation.other_user?.username && (
              <Text style={styles.headerUsername}>
                @{conversation.other_user.username}
              </Text>
            )}
          </View>
        )}
      </View>

      {!connected && !loading && !error && (
        <Text style={styles.banner}>Connexion en cours…</Text>
      )}

      {loading ? (
        <ActivityIndicator color="#FF8A32" size="large" style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={KEYBOARD_BEHAVIOR}
          keyboardVerticalOffset={0}
        >
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Aucun message pour le moment</Text>
              <Text style={styles.emptyText}>
                {blockedByMe
                  ? 'Tu as bloqué cet utilisateur.'
                  : `Écris le premier message à ${name}.`}
              </Text>
            </View>
          ) : (
            <FlatList
              style={styles.flex}
              data={messages}
              inverted
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.list}
              onEndReached={loadOlder}
              onEndReachedThreshold={0.3}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={
                Platform.OS === 'ios' ? 'interactive' : 'on-drag'
              }
              ListFooterComponent={
                loadingMore ? (
                  <ActivityIndicator color="#FF8A32" style={styles.moreLoader} />
                ) : undefined
              }
            />
          )}

          {!!notice && <Text style={styles.notice}>{notice}</Text>}

          {blockedByMe ? (
            <View style={[styles.blockedBar, { paddingBottom: bottomPadding + 6 }]}>
              <Text style={styles.blockedText}>
                Tu as bloqué cet utilisateur.
              </Text>
              <Pressable onPress={handleUnblock} hitSlop={8}>
                <Text style={styles.unblock}>Débloquer</Text>
              </Pressable>
            </View>
          ) : draftImage ? (
            <View style={[styles.draftBar, { paddingBottom: bottomPadding }]}>
              <Image source={{ uri: draftImage.uri }} style={styles.draftThumb} />
              <Text style={styles.draftText}>Photo prête à envoyer</Text>

              <Pressable
                style={[styles.draftButton, styles.draftCancel]}
                onPress={() => setDraftImage(null)}
              >
                <Text style={styles.draftCancelText}>Annuler</Text>
              </Pressable>

              <Pressable
                style={[styles.draftButton, styles.draftSend]}
                onPress={handleSendPhoto}
                disabled={!myId}
              >
                <Text style={styles.sendText}>Envoyer</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.inputBar, { paddingBottom: bottomPadding }]}>
              <View style={styles.inputPill}>
                <TextInput
                  style={[styles.input, { height: inputHeight }]}
                  placeholder="Écris un message..."
                  placeholderTextColor="#8493A8"
                  value={input}
                  onChangeText={setInput}
                  multiline
                  maxLength={MESSAGE_MAX_LENGTH}
                  scrollEnabled={inputHeight >= MAX_INPUT_HEIGHT}
                  onContentSizeChange={(event) => {
                    const contentHeight = event.nativeEvent.contentSize.height;

                    setInputHeight(
                      Math.min(
                        MAX_INPUT_HEIGHT,
                        Math.max(
                          MIN_INPUT_HEIGHT,
                          contentHeight + INPUT_VERTICAL_PADDING
                        )
                      )
                    );
                  }}
                />

                <Pressable
                  style={styles.pillButton}
                  onPress={() => handlePickPhoto('library')}
                  accessibilityLabel="Choisir une photo"
                  hitSlop={4}
                >
                  <Text style={styles.iconText}>🖼</Text>
                </Pressable>

                {Platform.OS !== 'web' && (
                  <Pressable
                    style={styles.pillButton}
                    onPress={() => handlePickPhoto('camera')}
                    accessibilityLabel="Prendre une photo"
                    hitSlop={4}
                  >
                    <Text style={styles.iconText}>📷</Text>
                  </Pressable>
                )}
              </View>

              <Pressable
                style={[styles.sendButton, !canSend && styles.sendDisabled]}
                onPress={handleSend}
                disabled={!canSend}
                accessibilityLabel="Envoyer le message"
              >
                <Text style={styles.sendIcon}>➤</Text>
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      )}

      <ImageViewerModal target={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#081426',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#10223A',
  },
  back: {
    color: '#FF8A32',
    fontSize: 16,
    marginBottom: 14,
  },
  headerInfo: {
    marginTop: 2,
  },
  headerName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  headerUsername: {
    color: '#A8B6C8',
    marginTop: 3,
  },
  banner: {
    backgroundColor: '#10223A',
    color: '#FF8A32',
    textAlign: 'center',
    paddingVertical: 6,
    fontSize: 12,
  },
  loader: {
    marginTop: 40,
  },
  moreLoader: {
    marginVertical: 12,
  },
  list: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: {
    marginBottom: 8,
    maxWidth: '100%',
  },
  rowMine: {
    alignItems: 'flex-end',
  },
  rowTheirs: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleImage: {
    padding: 4,
  },
  bubbleMine: {
    backgroundColor: '#FF8A32',
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: '#10223A',
    borderBottomLeftRadius: 4,
  },
  bubblePending: {
    opacity: 0.65,
  },
  textMine: {
    color: '#081426',
    fontSize: 15,
  },
  textTheirs: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  metaMine: {
    color: '#5A3511',
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  metaTheirs: {
    color: '#8493A8',
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  metaImage: {
    paddingHorizontal: 6,
    paddingBottom: 2,
  },
  failed: {
    color: '#FF8A32',
    fontSize: 12,
    marginTop: 4,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyText: {
    color: '#A8B6C8',
    marginTop: 10,
    textAlign: 'center',
  },
  notice: {
    color: '#FF8A32',
    textAlign: 'center',
    fontSize: 13,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  blockedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#10223A',
  },
  blockedText: {
    color: '#A8B6C8',
  },
  unblock: {
    color: '#FF8A32',
    fontWeight: '700',
  },
  draftBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#10223A',
  },
  draftThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#263A54',
  },
  draftText: {
    flex: 1,
    color: '#A8B6C8',
    fontSize: 13,
  },
  draftButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  draftCancel: {
    backgroundColor: '#263A54',
  },
  draftCancelText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  draftSend: {
    backgroundColor: '#FF8A32',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#10223A',
    backgroundColor: '#081426',
  },
  inputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#10223A',
    borderWidth: 1,
    borderColor: '#263A54',
    borderRadius: 24,
    paddingLeft: 6,
    paddingRight: 4,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    paddingHorizontal: 10,
    paddingVertical: INPUT_VERTICAL_PADDING / 2,
    textAlignVertical: 'center',
  },
  pillButton: {
    width: 36,
    height: MIN_INPUT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 20,
  },
  sendButton: {
    width: MIN_INPUT_HEIGHT + 2,
    height: MIN_INPUT_HEIGHT + 2,
    borderRadius: (MIN_INPUT_HEIGHT + 2) / 2,
    backgroundColor: '#FF8A32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.4,
  },
  sendIcon: {
    color: '#081426',
    fontSize: 18,
    fontWeight: '700',
  },
  sendText: {
    color: '#081426',
    fontWeight: '700',
  },
  error: {
    color: '#FF8A32',
    marginTop: 30,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
});