import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ActionsTarget = {
  id: string;
  preview: string;
  canEdit: boolean;
  /** Message non envoyé : « Supprimer » le retire seulement de l'écran. */
  failed: boolean;
};

type Props = {
  target: ActionsTarget | null;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export default function MessageActionsModal({
  target,
  onEdit,
  onDelete,
  onClose,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setConfirming(false);
  }, [target?.id]);

  return (
    <Modal
      visible={!!target}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          {!!target && (
            <>
              <Text style={styles.preview} numberOfLines={2}>
                {target.preview}
              </Text>

              {confirming ? (
                <View>
                  <Text style={styles.confirmText}>
                    {target.failed
                      ? 'Retirer ce message non envoyé ?'
                      : 'Supprimer ce message pour tout le monde ?'}
                  </Text>

                  <View style={styles.confirmActions}>
                    <Pressable
                      style={[styles.smallButton, styles.neutral]}
                      onPress={() => setConfirming(false)}
                    >
                      <Text style={styles.neutralText}>Annuler</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.smallButton, styles.danger]}
                      onPress={onDelete}
                    >
                      <Text style={styles.dangerText}>Supprimer</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View>
                  {target.canEdit && (
                    <Pressable style={styles.action} onPress={onEdit}>
                      <Ionicons name="create-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.actionText}>Modifier</Text>
                    </Pressable>
                  )}

                  <Pressable
                    style={styles.action}
                    onPress={() => setConfirming(true)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#FF8A32" />
                    <Text style={[styles.actionText, styles.actionDanger]}>
                      Supprimer
                    </Text>
                  </Pressable>

                  <Pressable style={styles.action} onPress={onClose}>
                    <Ionicons name="close" size={20} color="#A8B6C8" />
                    <Text style={[styles.actionText, styles.actionMuted]}>
                      Annuler
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </Pressable>
      </Pressable>
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
    backgroundColor: '#10223A',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 32,
    borderWidth: 1,
    borderColor: '#263A54',
  },
  preview: {
    color: '#A8B6C8',
    fontSize: 14,
    marginBottom: 14,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  actionDanger: {
    color: '#FF8A32',
    fontWeight: '600',
  },
  actionMuted: {
    color: '#A8B6C8',
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  smallButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 13,
  },
  neutral: {
    backgroundColor: '#263A54',
  },
  neutralText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  danger: {
    backgroundColor: '#FF8A32',
  },
  dangerText: {
    color: '#081426',
    fontWeight: '700',
  },
});