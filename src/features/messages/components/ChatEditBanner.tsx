import { Ionicons } from '@expo/vector-icons';
import {
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

type Props = {
  content: string | null;
  onCancel: () => void;
};

export default function ChatEditBanner({
  content,
  onCancel,
}: Props) {
  return (
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
          {content}
        </Text>
      </View>

      <Pressable
        onPress={onCancel}
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
  );
}

const styles = StyleSheet.create({
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
});