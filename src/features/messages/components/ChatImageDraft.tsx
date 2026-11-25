import {
    Image,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

type Props = {
  uri: string;
  bottomPadding: number;
  canSend: boolean;
  onCancel: () => void;
  onSend: () => void;
};

export default function ChatImageDraft({
  uri,
  bottomPadding,
  canSend,
  onCancel,
  onSend,
}: Props) {
  return (
    <View
      style={[
        styles.draftBar,
        { paddingBottom: bottomPadding },
      ]}
    >
      <Image
        source={{ uri }}
        style={styles.draftThumb}
      />

      <Text style={styles.draftText}>
        Photo prête à envoyer
      </Text>

      <Pressable
        style={[styles.draftButton, styles.draftCancel]}
        onPress={onCancel}
      >
        <Text style={styles.draftCancelText}>
          Annuler
        </Text>
      </Pressable>

      <Pressable
        style={[styles.draftButton, styles.draftSend]}
        onPress={onSend}
        disabled={!canSend}
      >
        <Text style={styles.sendText}>
          Envoyer
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
  sendText: {
    color: '#081426',
    fontWeight: '700',
  },
});