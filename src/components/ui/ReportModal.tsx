import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { REPORT_REASONS } from '@/services/report.service';
import type { ReportReason } from '@/services/report.service';

type Props = {
  visible: boolean;
  username: string;
  onClose: () => void;
  onSubmit: (reason: ReportReason, details: string) => Promise<void>;
};

export default function ReportModal({
  visible,
  username,
  onClose,
  onSubmit,
}: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setReason(null);
    setDetails('');
    setError('');
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (!reason || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      await onSubmit(reason, details);
      reset();
      onClose();
    } catch {
      setError("Impossible d'envoyer le signalement. Réessaie.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Signaler @{username}</Text>
            <Text style={styles.subtitle}>Quel est le problème ?</Text>

            {REPORT_REASONS.map((item) => {
              const selected = reason === item.value;

              return (
                <Pressable
                  key={item.value}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => setReason(item.value)}
                >
                  <Text
                    style={[styles.optionText, selected && styles.optionTextSelected]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}

            <TextInput
              style={styles.input}
              placeholder="Détails (facultatif)"
              placeholderTextColor="#8493A8"
              value={details}
              onChangeText={setDetails}
              multiline
              maxLength={1000}
            />

            {!!error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Pressable
                style={[styles.button, styles.cancel]}
                onPress={handleClose}
                disabled={submitting}
              >
                <Text style={styles.cancelText}>Annuler</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.button,
                  styles.submit,
                  (!reason || submitting) && styles.submitDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!reason || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#081426" />
                ) : (
                  <Text style={styles.submitText}>Envoyer</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: '#081426',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: '#263A54',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: '#A8B6C8',
    marginTop: 6,
    marginBottom: 16,
  },
  option: {
    backgroundColor: '#10223A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#263A54',
    padding: 14,
    marginBottom: 10,
  },
  optionSelected: {
    borderColor: '#FF8A32',
  },
  optionText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  optionTextSelected: {
    color: '#FF8A32',
    fontWeight: '600',
  },
  input: {
    minHeight: 80,
    maxHeight: 140,
    backgroundColor: '#10223A',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#263A54',
    borderRadius: 12,
    padding: 14,
    marginTop: 6,
    textAlignVertical: 'top',
  },
  error: {
    color: '#FF8A32',
    marginTop: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 14,
  },
  cancel: {
    backgroundColor: '#263A54',
  },
  cancelText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  submit: {
    backgroundColor: '#FF8A32',
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: '#081426',
    fontWeight: '700',
  },
});