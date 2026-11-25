import CallHistory from '@/features/calls/components/CallHistory';
import type { ChatMessage } from '@/features/messages/types/chat-message';
import type { ConversationSummary } from '@/services/conversation.service';
import {
  getConversationById,
  getCurrentUserId,
} from '@/services/conversation.service';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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
  canActOnMessage,
  canEditMessage,
  deliveryOf,
  editErrorMessage,
  isPermissionError,
  upsertMessages,
} from '@/features/messages/utils/chat-message.utils';

import { isUserBlocked, unblockUser } from '@/services/block.service';

import { startAudioCall } from '@/services/call.service';

import ConversationHeader from '@/features/messages/components/ConversationHeader';
import ImageMessage from '@/features/messages/components/ImageMessage';
import type { ViewerTarget } from '@/features/messages/components/ImageViewerModal';
import ImageViewerModal from '@/features/messages/components/ImageViewerModal';
import MessageActionsModal from '@/features/messages/components/MessageActionsModal';
import { useConversationLive } from '@/features/messages/hooks/useConversationLive';
import PresenceLabel from '@/features/presence/components/PresenceLabel';
import { useContactPresence } from '@/features/presence/hooks/useContactPresence';
import { useActiveConversation } from '@/hooks/useActiveConversation';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useUserSettings } from '@/hooks/useUserSettings';
import { formatMessageTime } from '@/utils/format';
import { generateId } from '@/utils/id';

const KEYBOARD_BEHAVIOR: 'padding' | undefined = 'padding';

const MIN_INPUT_HEIGHT = 44;
const MAX_INPUT_HEIGHT = 132;
const INPUT_VERTICAL_PADDING = 20;

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
    const mine = item.sender_id === myId;
    const isImage = item.type === 'image';
    const deleted = !!item.deleted_at;
    const actionable = canActOnMessage(item, myId);

    const openActions = actionable
      ? () => setActionsTarget(item)
      : undefined;

    const delivery =
      mine && item.status === 'sent' && !deleted
        ? deliveryOf(item, receipts)
        : null;

    return (
      <View
        style={[
          styles.row,
          mine ? styles.rowMine : styles.rowTheirs,
        ]}
      >
        <View
          style={[
            styles.line,
            mine ? styles.lineMine : styles.lineTheirs,
          ]}
        >
          {actionable && Platform.OS === 'web' && (
            <Pressable
              onPress={openActions}
              hitSlop={8}
              style={styles.menuButton}
              accessibilityLabel="Actions du message"
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={16}
                color="#8493A8"
              />
            </Pressable>
          )}

          <Pressable
            onLongPress={openActions}
            delayLongPress={350}
            style={[
              styles.bubble,
              mine
                ? styles.bubbleMine
                : styles.bubbleTheirs,
              isImage && !deleted && styles.bubbleImage,
              item.status === 'pending' &&
                styles.bubblePending,
            ]}
          >
            {deleted ? (
              <View style={styles.tombstone}>
                <Ionicons
                  name="ban-outline"
                  size={14}
                  color={
                    mine ? '#5A3511' : '#8493A8'
                  }
                />

                <Text
                  style={[
                    styles.tombstoneText,
                    mine
                      ? styles.tombstoneMine
                      : styles.tombstoneTheirs,
                  ]}
                >
                  Message supprimé
                </Text>
              </View>
            ) : isImage ? (
              <ImageMessage
                mediaPath={item.media_path}
                localUri={item.localUri}
                onLongPress={openActions}
                onOpen={() =>
                  setViewer({
                    mediaPath: item.media_path,
                    localUri: item.localUri,
                    canDownload:
                      item.status === 'sent',
                  })
                }
              />
            ) : (
              <Text
                style={
                  mine
                    ? styles.textMine
                    : styles.textTheirs
                }
              >
                {item.content}
              </Text>
            )}

            <View
              style={[
                styles.metaRow,
                isImage && !deleted && styles.metaImage,
              ]}
            >
              <Text
                style={
                  mine
                    ? styles.metaMineText
                    : styles.metaTheirsText
                }
              >
                {item.edited_at && !deleted
                  ? 'modifié · '
                  : ''}
                {formatMessageTime(item.created_at)}
                {mine && item.status === 'pending'
                  ? ' · Envoi…'
                  : ''}
              </Text>

              {delivery && (
                <Ionicons
                  name={
                    delivery === 'sent'
                      ? 'checkmark'
                      : 'checkmark-done'
                  }
                  size={14}
                  color={
                    delivery === 'read'
                      ? '#FFFFFF'
                      : '#5A3511'
                  }
                />
              )}
            </View>
          </Pressable>
        </View>

        {mine && item.status === 'failed' && (
          <Pressable
            onPress={() => handleRetry(item)}
            hitSlop={8}
          >
            <Text style={styles.failed}>
              Échec de l&apos;envoi · Réessayer
            </Text>
          </Pressable>
        )}
      </View>
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
            <View
              style={[
                styles.draftBar,
                { paddingBottom: bottomPadding },
              ]}
            >
              <Image
                source={{ uri: draftImage.uri }}
                style={styles.draftThumb}
              />

              <Text style={styles.draftText}>
                Photo prête à envoyer
              </Text>

              <Pressable
                style={[
                  styles.draftButton,
                  styles.draftCancel,
                ]}
                onPress={() => setDraftImage(null)}
              >
                <Text style={styles.draftCancelText}>
                  Annuler
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.draftButton,
                  styles.draftSend,
                ]}
                onPress={handleSendPhoto}
                disabled={!myId}
              >
                <Text style={styles.sendText}>
                  Envoyer
                </Text>
              </Pressable>
            </View>
          ) : (
            <View>
              {!!editing && (
                <View style={styles.editBanner}>
                  <Ionicons
                    name="create-outline"
                    size={18}
                    color="#FF8A32"
                  />

                  <View style={styles.editBannerText}>
                    <Text style={styles.editTitle}>
                      Modifier le message
                    </Text>

                    <Text
                      style={styles.editPreview}
                      numberOfLines={1}
                    >
                      {editing.content}
                    </Text>
                  </View>

                  <Pressable
                    onPress={cancelEdit}
                    hitSlop={10}
                    accessibilityLabel="Annuler la modification"
                  >
                    <Ionicons
                      name="close"
                      size={20}
                      color="#A8B6C8"
                    />
                  </Pressable>
                </View>
              )}

              <View
                style={[
                  styles.inputBar,
                  { paddingBottom: bottomPadding },
                ]}
              >
                <View style={styles.inputPill}>
                  <TextInput
                    style={[
                      styles.input,
                      { height: inputHeight },
                    ]}
                    placeholder={
                      editing
                        ? 'Modifier le message...'
                        : 'Écris un message...'
                    }
                    placeholderTextColor="#8493A8"
                    value={input}
                    onChangeText={
                      handleChangeText
                    }
                    multiline
                    maxLength={MESSAGE_MAX_LENGTH}
                    scrollEnabled={
                      inputHeight >= MAX_INPUT_HEIGHT
                    }
                    onContentSizeChange={(
                      event
                    ) => {
                      const contentHeight =
                        event.nativeEvent
                          .contentSize.height;

                      setInputHeight(
                        Math.min(
                          MAX_INPUT_HEIGHT,
                          Math.max(
                            MIN_INPUT_HEIGHT,
                            contentHeight +
                              INPUT_VERTICAL_PADDING
                          )
                        )
                      );
                    }}
                  />

                  {!editing && (
                    <>
                      <Pressable
                        style={styles.pillButton}
                        onPress={() =>
                          handlePickPhoto('library')
                        }
                        accessibilityLabel="Choisir une photo"
                        hitSlop={4}
                      >
                        <Ionicons
                          name="image-outline"
                          size={22}
                          color="#A8B6C8"
                        />
                      </Pressable>

                      {Platform.OS !== 'web' && (
                        <Pressable
                          style={styles.pillButton}
                          onPress={() =>
                            handlePickPhoto(
                              'camera'
                            )
                          }
                          accessibilityLabel="Prendre une photo"
                          hitSlop={4}
                        >
                          <Ionicons
                            name="camera-outline"
                            size={22}
                            color="#A8B6C8"
                          />
                        </Pressable>
                      )}
                    </>
                  )}
                </View>

                <Pressable
                  style={[
                    styles.sendButton,
                    !canSend && styles.sendDisabled,
                  ]}
                  onPress={
                    editing
                      ? handleSaveEdit
                      : handleSend
                  }
                  disabled={!canSend}
                  accessibilityLabel={
                    editing
                      ? 'Enregistrer la modification'
                      : 'Envoyer le message'
                  }
                >
                  {savingEdit ? (
                    <ActivityIndicator
                      color="#081426"
                    />
                  ) : (
                    <Ionicons
                      name={
                        editing
                          ? 'checkmark'
                          : 'send'
                      }
                      size={20}
                      color="#081426"
                    />
                  )}
                </Pressable>
              </View>
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

  line: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '100%',
  },

  lineMine: {
    justifyContent: 'flex-end',
  },

  lineTheirs: {
    justifyContent: 'flex-start',
  },

  menuButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
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

  tombstone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  tombstoneText: {
    fontSize: 14,
    fontStyle: 'italic',
  },

  tombstoneMine: {
    color: '#5A3511',
  },

  tombstoneTheirs: {
    color: '#8493A8',
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: 4,
  },

  metaMineText: {
    color: '#5A3511',
    fontSize: 11,
  },

  metaTheirsText: {
    color: '#8493A8',
    fontSize: 11,
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

  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#10223A',
    borderTopWidth: 1,
    borderTopColor: '#263A54',
  },

  editBannerText: {
    flex: 1,
  },

  editTitle: {
    color: '#FF8A32',
    fontSize: 13,
    fontWeight: '700',
  },

  editPreview: {
    color: '#A8B6C8',
    fontSize: 13,
    marginTop: 2,
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