import { Ionicons } from '@expo/vector-icons';
import {
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import ImageMessage from '@/features/messages/components/ImageMessage';
import type { ViewerTarget } from '@/features/messages/components/ImageViewerModal';
import type { ChatMessage } from '@/features/messages/types/chat-message';
import {
    canActOnMessage,
    deliveryOf,
} from '@/features/messages/utils/chat-message.utils';
import type { PeerReceipts } from '@/services/receipt.service';
import { formatMessageTime } from '@/utils/format';

type Props = {
  message: ChatMessage;
  myId: string | null;
  receipts: PeerReceipts | null;
  onActions: (message: ChatMessage) => void;
  onOpenImage: (target: ViewerTarget) => void;
  onRetry: (message: ChatMessage) => void;
};

export default function ChatMessageBubble({
  message,
  myId,
  receipts,
  onActions,
  onOpenImage,
  onRetry,
}: Props) {
  const mine = message.sender_id === myId;
  const isImage = message.type === 'image';
  const deleted = !!message.deleted_at;
  const actionable = canActOnMessage(message, myId);

  const openActions = actionable
    ? () => onActions(message)
    : undefined;

  const delivery =
    mine && message.status === 'sent' && !deleted
      ? deliveryOf(message, receipts)
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
            mine ? styles.bubbleMine : styles.bubbleTheirs,
            isImage && !deleted && styles.bubbleImage,
            message.status === 'pending' && styles.bubblePending,
          ]}
        >
          {deleted ? (
            <View style={styles.tombstone}>
              <Ionicons
                name="ban-outline"
                size={14}
                color={mine ? '#5A3511' : '#8493A8'}
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
              mediaPath={message.media_path}
              localUri={message.localUri}
              onLongPress={openActions}
              onOpen={() =>
                onOpenImage({
                  mediaPath: message.media_path,
                  localUri: message.localUri,
                  canDownload: message.status === 'sent',
                })
              }
            />
          ) : (
            <Text
              style={mine ? styles.textMine : styles.textTheirs}
            >
              {message.content}
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
              {message.edited_at && !deleted ? 'modifié · ' : ''}
              {formatMessageTime(message.created_at)}
              {mine && message.status === 'pending'
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
                color={delivery === 'read' ? '#FFFFFF' : '#5A3511'}
              />
            )}
          </View>
        </Pressable>
      </View>

      {mine && message.status === 'failed' && (
        <Pressable
          onPress={() => onRetry(message)}
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

const styles = StyleSheet.create({
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
});