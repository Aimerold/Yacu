import { Ionicons } from '@expo/vector-icons';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';

import { MESSAGE_MAX_LENGTH } from '@/services/message.service';

const MIN_INPUT_HEIGHT = 44;
const MAX_INPUT_HEIGHT = 132;
const INPUT_VERTICAL_PADDING = 20;

type Props = {
  value: string;
  inputHeight: number;
  bottomPadding: number;
  editing: boolean;
  savingEdit: boolean;
  canSend: boolean;
  onChangeText: (value: string) => void;
  onInputHeightChange: (height: number) => void;
  onPickPhoto: (source: 'library' | 'camera') => Promise<void>;
  onSubmit: () => Promise<void>;
};

export default function ChatComposer({
  value,
  inputHeight,
  bottomPadding,
  editing,
  savingEdit,
  canSend,
  onChangeText,
  onInputHeightChange,
  onPickPhoto,
  onSubmit,
}: Props) {
  return (
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
          value={value}
          onChangeText={onChangeText}
          multiline
          maxLength={MESSAGE_MAX_LENGTH}
          scrollEnabled={inputHeight >= MAX_INPUT_HEIGHT}
          onContentSizeChange={(event) => {
            const contentHeight =
              event.nativeEvent.contentSize.height;

            onInputHeightChange(
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

        {!editing && (
          <>
            <Pressable
              style={styles.pillButton}
              onPress={() => onPickPhoto('library')}
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
                onPress={() => onPickPhoto('camera')}
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
        onPress={onSubmit}
        disabled={!canSend}
        accessibilityLabel={
          editing
            ? 'Enregistrer la modification'
            : 'Envoyer le message'
        }
      >
        {savingEdit ? (
          <ActivityIndicator color="#081426" />
        ) : (
          <Ionicons
            name={editing ? 'checkmark' : 'send'}
            size={20}
            color="#081426"
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
});