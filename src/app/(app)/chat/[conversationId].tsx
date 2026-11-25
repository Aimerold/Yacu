import CallHistory from '@/features/calls/components/CallHistory';
import ChatMessageBubble from '@/features/messages/components/ChatMessageBubble';
import type { ChatMessage } from '@/features/messages/types/chat-message';
import type { ConversationSummary } from '@/services/conversation.service';
import {
  getConversationById,
  getCurrentUserId,
} from '@/services/conversation.service';
import type { Message } from '@/services/message.service';
import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_PAGE_SIZE,
  deleteMessage,
  editMessage,
  getMessages,
  markConversationRead,
  sendImageMessage,
  sendTextMessage,
  subscribeToConversationMessages,
} from '@/services/message.service';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ChatComposer from '@/features/messages/components/ChatComposer';
import ChatEditBanner from '@/features/messages/components/ChatEditBanner';
import ChatImageDraft from '@/features/messages/components/ChatImageDraft';
import type { PreparedImage } from '@/services/media.service';
import {
  MediaError,
  buildChatImagePath,
  pickImageFromLibrary,
  removeChatImage,
  takePhoto,
  uploadChatImage,
} from '@/services/media.service';

import {
  addPendingTextMessage,
  getPendingTextMessagesForConversation,
  removePendingTextMessage,
} from '@/services/offline-messages.service';

import {
  canEditMessage,
  editErrorMessage,
  isPermissionError,
  upsertMessages,
} from '@/features/messages/utils/chat-message.utils';

import { isUserBlocked, unblockUser } from '@/services/block.service';

import { startAudioCall } from '@/services/call.service';

import ConversationHeader from '@/features/messages/components/ConversationHeader';
import type { ViewerTarget } from '@/features/messages/components/ImageViewerModal';
import ImageViewerModal from '@/features/messages/components/ImageViewerModal';
import MessageActionsModal from '@/features/messages/components/MessageActionsModal';
import { useConversationLive } from '@/features/messages/hooks/useConversationLive';
import PresenceLabel from '@/features/presence/components/PresenceLabel';
import { useContactPresence } from '@/features/presence/hooks/useContactPresence';
import { useActiveConversation } from '@/hooks/useActiveConversation';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useUserSettings } from '@/hooks/useUserSettings';
import { generateId } from '@/utils/id';

const KEYBOARD_BEHAVIOR: 'padding' | undefined = 'padding';

const MIN_INPUT_HEIGHT = 44;

export default function ConversationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const { conversationId } = useLocalSearchParams<{
    conversationId: string;
  }>();

  useActiveConversation(conversationId);

  const [conversation, setConversation] =
    useState<ConversationSummary | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [inputHeight, setInputHeight] = useState(
    MIN_INPUT_HEIGHT
  );
  const [draftImage, setDraftImage] =
    useState<PreparedImage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(
    null
  );
  const [savingEdit, setSavingEdit] = useState(false);
  const [startingCall, setStartingCall] = useState(false);
  const [actionsTarget, setActionsTarget] =
    useState<ChatMessage | null>(null);
  const [viewer, setViewer] = useState<ViewerTarget | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [connected, setConnected] = useState(true);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const { settings } = useUserSettings();
  const typingEnabled =
    settings?.typing_indicator_enabled ?? true;

  const {
    peerTyping,
    receipts,
    notifyTyping,
    stopTyping,
    announceRead,
  } = useConversationLive({
    conversationId,
    typingEnabled,
  });

  const isGroup = conversation?.type === 'group';

  const presence = useContactPresence(
    isGroup ? undefined : conversation?.other_user?.id
  );

  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const pendingImages = useRef(
    new Map<string, PreparedImage>()
  );

  const bottomPadding = keyboardVisible
    ? 8
    : Math.max(insets.bottom, 8) + 8;

  const markRead = useCallback(() => {
    if (!conversationId) return;

    markConversationRead(conversationId)
      .then(() => announceRead())
      .catch(() => undefined);
  }, [conversationId, announceRead]);

  const syncLatest = useCallback(async () => {
    if (!conversationId) return;

    try {
      const latest = await getMessages(conversationId);

      setMessages((previous) =>
        upsertMessages(
          previous,
          latest.map((message) => ({
            ...message,
            status: 'sent' as const,
          }))
        )
      );

      markRead();
    } catch {
      // Réseau coupé : nouvelle synchronisation à la reconnexion.
    }
  }, [conversationId, markRead]);

  const deliver = useCallback(
    async (message: ChatMessage) => {
      if (!conversationId) return;

      try {
        let saved: Message;

        if (message.type === 'image') {
          const image = pendingImages.current.get(
            message.id
          );

          if (!image || !message.media_path) {
            throw new Error('Photo indisponible.');
          }

          await uploadChatImage(
            message.media_path,
            image.base64
          );

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

          await removePendingTextMessage(message.id);
        }

        setMessages((previous) =>
          upsertMessages(previous, [
            {
              ...saved,
              status: 'sent',
              localUri: message.localUri,
            },
          ])
        );
      } catch (e) {
        if (isPermissionError(e)) {
          pendingImages.current.delete(message.id);
          await removePendingTextMessage(message.id);

          setMessages((previous) =>
            previous.filter(
              (item) => item.id !== message.id
            )
          );

          setNotice(
            'Tu ne peux pas envoyer de message dans cette conversation.'
          );

          return;
        }

        setMessages((previous) =>
          upsertMessages(previous, [
            { ...message, status: 'failed' },
          ])
        );
      }
    },
    [conversationId]
  );

  const flushPendingMessages = useCallback(async () => {
    if (!conversationId) return;

    const pending =
      await getPendingTextMessagesForConversation(
        conversationId
      );

    for (const item of pending) {
      const message: ChatMessage = {
        id: item.id,
        conversation_id: item.conversationId,
        sender_id: myId ?? '',
        type: 'text',
        content: item.content,
        media_path: null,
        created_at: item.createdAt,
        edited_at: null,
        deleted_at: null,
        status: 'pending',
      };

      await deliver(message);
    }
  }, [conversationId, myId, deliver]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        if (!conversationId) {
          throw new Error('Conversation manquante.');
        }

        const [
          conversationResult,
          userId,
          firstPage,
        ] = await Promise.all([
          getConversationById(conversationId),
          getCurrentUserId(),
          getMessages(conversationId),
        ]);

        if (!active) return;

        if (!conversationResult) {
          setError(
            'Conversation introuvable ou accès refusé.'
          );
          return;
        }

        const otherId =
          conversationResult.other_user?.id;

        const blocked = otherId
          ? await isUserBlocked(otherId).catch(
              () => false
            )
          : false;

        if (!active) return;

        setConversation(conversationResult);
        setMyId(userId);
        setBlockedByMe(blocked);

        setMessages(
          firstPage.map((message) => ({
            ...message,
            status: 'sent' as const,
          }))
        );

        setHasMore(
          firstPage.length === MESSAGE_PAGE_SIZE
        );

        markRead();
      } catch {
        if (active) {
          setError(
            'Impossible de charger cette conversation.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [conversationId, markRead]);

  useEffect(() => {
    if (!conversationId) return;

    const unsubscribe =
      subscribeToConversationMessages(conversationId, {
        onInsert: (message) => {
          setMessages((previous) =>
            upsertMessages(previous, [
              { ...message, status: 'sent' },
            ])
          );

          markRead();
        },
        onUpdate: (message) => {
          setMessages((previous) =>
            upsertMessages(previous, [
              { ...message, status: 'sent' },
            ])
          );
        },
        onStatus: (status) => {
          const isConnected = status === 'SUBSCRIBED';
          setConnected(isConnected);

          if (isConnected) {
            void syncLatest();
            void flushPendingMessages();
          }
        },
      });

    return unsubscribe;
  }, [
    conversationId,
    markRead,
    syncLatest,
    flushPendingMessages,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (state) => {
        if (state === 'active') {
          void syncLatest();
          void flushPendingMessages();
        }
      }
    );

    return () => subscription.remove();
  }, [syncLatest, flushPendingMessages]);

  async function loadOlder() {
    if (!conversationId || loadingMore || !hasMore) {
      return;
    }

    const oldestSent = [...messagesRef.current]
      .reverse()
      .find((message) => message.status === 'sent');

    if (!oldestSent) return;

    setLoadingMore(true);

    try {
      const page = await getMessages(
        conversationId,
        oldestSent.created_at
      );

      setMessages((previous) =>
        upsertMessages(
          previous,
          page.map((message) => ({
            ...message,
            status: 'sent' as const,
          }))
        )
      );

      setHasMore(page.length === MESSAGE_PAGE_SIZE);
    } catch {
      // On pourra réessayer en remontant dans la liste.
    } finally {
      setLoadingMore(false);
    }
  }

  function handleChangeText(value: string) {
    setInput(value);

    if (editing) return;

    if (value.trim().length > 0) {
      notifyTyping();
    } else {
      stopTyping();
    }
  }

  async function handleSend() {
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

    stopTyping();
    setNotice('');
    setMessages((previous) =>
      upsertMessages(previous, [optimistic])
    );
    setInput('');
    setInputHeight(MIN_INPUT_HEIGHT);

    await addPendingTextMessage({
      id: optimistic.id,
      conversationId,
      content,
      createdAt: optimistic.created_at,
    });

    void deliver(optimistic);
  }

  async function handlePickPhoto(
    source: 'library' | 'camera'
  ) {
    setNotice('');

    try {
      const image =
        source === 'camera'
          ? await takePhoto()
          : await pickImageFromLibrary();

      if (image) setDraftImage(image);
    } catch (e) {
      setNotice(
        e instanceof MediaError
          ? e.message
          : "Impossible d'ajouter la photo."
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
      media_path: buildChatImagePath(
        conversationId,
        myId,
        id
      ),
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      status: 'pending',
      localUri: draftImage.uri,
    };

    pendingImages.current.set(id, draftImage);

    stopTyping();
    setNotice('');
    setMessages((previous) =>
      upsertMessages(previous, [optimistic])
    );
    setDraftImage(null);

    void deliver(optimistic);
  }

  function handleRetry(message: ChatMessage) {
    const pending: ChatMessage = {
      ...message,
      status: 'pending',
    };

    setNotice('');
    setMessages((previous) =>
      upsertMessages(previous, [pending])
    );

    void deliver(pending);
  }

  function startEdit() {
    const target = actionsTarget;

    setActionsTarget(null);

    if (!target || !canEditMessage(target, myId)) {
      return;
    }

    stopTyping();
    setNotice('');
    setDraftImage(null);
    setEditing(target);
    setInput(target.content ?? '');
  }

  function cancelEdit() {
    setEditing(null);
    setInput('');
    setInputHeight(MIN_INPUT_HEIGHT);
  }

  async function handleSaveEdit() {
    if (!editing || savingEdit) return;

    const content = input.trim();

    if (!content) return;

    if (content === (editing.content ?? '')) {
      cancelEdit();
      return;
    }

    setSavingEdit(true);
    setNotice('');

    try {
      const saved = await editMessage({
        id: editing.id,
        content,
      });

      setMessages((previous) =>
        upsertMessages(previous, [
          { ...saved, status: 'sent' },
        ])
      );

      cancelEdit();
    } catch (e) {
      setNotice(editErrorMessage(e));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(message: ChatMessage) {
    setNotice('');

    if (message.status === 'failed') {
      pendingImages.current.delete(message.id);
      await removePendingTextMessage(message.id);

      setMessages((previous) =>
        previous.filter(
          (item) => item.id !== message.id
        )
      );

      return;
    }

    try {
      const saved = await deleteMessage(message.id);

      setMessages((previous) =>
        upsertMessages(previous, [
          { ...saved, status: 'sent' },
        ])
      );

      if (editing?.id === message.id) cancelEdit();

      if (
        message.type === 'image' &&
        message.media_path
      ) {
        void removeChatImage(
          message.media_path
        ).catch(() => undefined);
      }
    } catch {
      setNotice(
        'Impossible de supprimer le message. Réessaie.'
      );
    }
  }

  function confirmDelete() {
    const target = actionsTarget;

    setActionsTarget(null);

    if (target) void handleDelete(target);
  }

  async function handleUnblock() {
    const otherId = conversation?.other_user?.id;

    if (!otherId) return;

    try {
      await unblockUser(otherId);
      setBlockedByMe(false);
      setNotice('');
    } catch {
      setNotice(
        'Impossible de débloquer cet utilisateur. Réessaie.'
      );
    }
  }

  async function handleStartAudioCall() {
    if (
      !conversationId ||
      !conversation ||
      isGroup ||
      !conversation.other_user ||
      startingCall
    ) {
      return;
    }

    try {
      setStartingCall(true);

      const call = await startAudioCall(
        conversationId,
        conversation.other_user.id
      );

      router.push({
        pathname: '/call/[callId]',
        params: {
          callId: call.id,
          conversationId,
        },
      });
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Impossible de démarrer l'appel.";

      setNotice(message);
    } finally {
      setStartingCall(false);
    }
  }

  const name = isGroup
    ? conversation?.name || 'Groupe'
    : conversation?.other_user?.display_name ||
      conversation?.other_user?.username ||
      'Conversation';

  const headerAvatarUrl = isGroup
    ? conversation?.avatar_url ?? null
    : conversation?.other_user?.avatar_url ?? null;

  const canSend =
    input.trim().length > 0 && !!myId && !savingEdit;

  function renderMessage({ item }: { item: ChatMessage }) {
    return (
      <ChatMessageBubble
        message={item}
        myId={myId}
        receipts={receipts}
        onActions={setActionsTarget}
        onOpenImage={setViewer}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <CallHistory conversationId={conversationId} />

      <ConversationHeader
        onBack={() => router.back()}
        name={name}
        avatarUrl={headerAvatarUrl}
        rightAction={
          !isGroup && conversation?.other_user ? (
            <Pressable
              onPress={handleStartAudioCall}
              disabled={startingCall}
              hitSlop={8}
              accessibilityLabel="Démarrer un appel audio"
            >
              {startingCall ? (
                <ActivityIndicator
                  size="small"
                  color="#FF8A32"
                />
              ) : (
                <Ionicons
                  name="call-outline"
                  size={22}
                  color="#FFFFFF"
                />
              )}
            </Pressable>
          ) : undefined
        }
        showInfo={!!conversation}
        onPressInfo={
          isGroup
            ? () =>
                router.push({
                  pathname:
                    '/group/[conversationId]',
                  params: { conversationId },
                })
            : undefined
        }
      >
        {isGroup ? (
          <Text style={styles.groupSubtitle}>
            Groupe
          </Text>
        ) : (
          <PresenceLabel
            typing={peerTyping}
            presence={presence}
            fallback={
              conversation?.other_user?.username
                ? `@${conversation.other_user.username}`
                : undefined
            }
          />
        )}
      </ConversationHeader>

      {!connected && !loading && !error && (
        <Text style={styles.banner}>
          Connexion en cours…
        </Text>
      )}

      {loading ? (
        <ActivityIndicator
          color="#FF8A32"
          size="large"
          style={styles.loader}
        />
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
              <Text style={styles.emptyTitle}>
                Aucun message pour le moment
              </Text>

              <Text style={styles.emptyText}>
                {isGroup
                  ? 'Écris le premier message dans ce groupe.'
                  : blockedByMe
                    ? 'Tu as bloqué cet utilisateur.'
                    : `Écris le premier message à ${name}.`}
              </Text>
            </View>
          ) : (
            <FlatList
              style={styles.flex}
              data={messages}
              extraData={receipts}
              inverted
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.list}
              onEndReached={loadOlder}
              onEndReachedThreshold={0.3}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={
                Platform.OS === 'ios'
                  ? 'interactive'
                  : 'on-drag'
              }
              ListFooterComponent={
                loadingMore ? (
                  <ActivityIndicator
                    color="#FF8A32"
                    style={styles.moreLoader}
                  />
                ) : undefined
              }
            />
          )}

          {!!notice && (
            <Text style={styles.notice}>
              {notice}
            </Text>
          )}

          {!isGroup && blockedByMe ? (
            <View
              style={[
                styles.blockedBar,
                {
                  paddingBottom: bottomPadding + 6,
                },
              ]}
            >
              <Text style={styles.blockedText}>
                Tu as bloqué cet utilisateur.
              </Text>

              <Pressable
                onPress={handleUnblock}
                hitSlop={8}
              >
                <Text style={styles.unblock}>
                  Débloquer
                </Text>
              </Pressable>
            </View>
          ) : draftImage ? (
            <ChatImageDraft
              uri={draftImage.uri}
              bottomPadding={bottomPadding}
              canSend={!!myId}
              onCancel={() => setDraftImage(null)}
              onSend={handleSendPhoto}
            />
          ) : (
            <View>
              {!!editing && (
                <ChatEditBanner
                  content={editing.content}
                  onCancel={cancelEdit}
                />
              )}

              <ChatComposer
                value={input}
                inputHeight={inputHeight}
                bottomPadding={bottomPadding}
                editing={!!editing}
                savingEdit={savingEdit}
                canSend={canSend}
                onChangeText={handleChangeText}
                onInputHeightChange={setInputHeight}
                onPickPhoto={handlePickPhoto}
                onSubmit={
                  editing ? handleSaveEdit : handleSend
                }
              />
            </View>
          )}
        </KeyboardAvoidingView>
      )}

      <ImageViewerModal
        target={viewer}
        onClose={() => setViewer(null)}
      />

      <MessageActionsModal
        target={
          actionsTarget
            ? {
                id: actionsTarget.id,
                preview:
                  actionsTarget.type === 'image'
                    ? '📷 Photo'
                    : actionsTarget.content ?? '',
                canEdit: canEditMessage(
                  actionsTarget,
                  myId
                ),
                failed:
                  actionsTarget.status === 'failed',
              }
            : null
        }
        onEdit={startEdit}
        onDelete={confirmDelete}
        onClose={() => setActionsTarget(null)}
      />
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

  groupSubtitle: {
    color: '#A8B6C8',
    fontSize: 13,
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

  error: {
    color: '#FF8A32',
    marginTop: 30,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
});