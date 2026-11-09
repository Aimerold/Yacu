import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { FriendRelation } from '@/services/friendship.service';
import { colors } from '@/theme/tokens';

type Props = {
  relation: FriendRelation;
  disabled?: boolean;
  onSend: () => Promise<void>;
  onCancel: (requestId: string) => Promise<void>;
  onRespond: (requestId: string, accept: boolean) => Promise<void>;
  onRemove: () => Promise<void>;
};

export default function FriendActionButton({
  relation,
  disabled = false,
  onSend,
  onCancel,
  onRespond,
  onRemove,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState('');

  const isDisabled = disabled || busy;

  async function run(action: () => Promise<void>) {
    if (isDisabled) return;

    setBusy(true);
    setError('');

    try {
      await action();
      setConfirmRemove(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Impossible d’effectuer cette action. Réessaie.'
      );
    } finally {
      setBusy(false);
    }
  }

  function withRequestId(
    action: (requestId: string) => Promise<void>
  ) {
    const requestId = relation.requestId;

    if (!requestId) {
      setError('Cette demande n’existe plus.');
      return;
    }

    void run(() => action(requestId));
  }

  if (relation.state === 'request_received') {
    return (
      <View style={styles.wrapper}>
        <View style={styles.actions}>
          <Pressable
            style={[
              styles.button,
              styles.rowButton,
              styles.primary,
              isDisabled && styles.disabled,
            ]}
            onPress={() => withRequestId((id) => onRespond(id, true))}
            disabled={isDisabled}
            accessibilityRole="button"
            accessibilityLabel="Accepter la demande d’amitié"
          >
            {busy ? (
              <ActivityIndicator
                size="small"
                color={colors.onAccent}
              />
            ) : (
              <Text style={styles.primaryText}>Accepter</Text>
            )}
          </Pressable>

          <Pressable
            style={[
              styles.button,
              styles.rowButton,
              styles.secondary,
              isDisabled && styles.disabled,
            ]}
            onPress={() => withRequestId((id) => onRespond(id, false))}
            disabled={isDisabled}
            accessibilityRole="button"
            accessibilityLabel="Refuser la demande d’amitié"
          >
            <Text style={styles.secondaryText}>Refuser</Text>
          </Pressable>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  if (relation.state === 'friends' && confirmRemove) {
    return (
      <View style={styles.confirmBox}>
        <Text style={styles.confirmText}>Retirer cet ami ?</Text>

        <View style={styles.actions}>
          <Pressable
            style={[
              styles.button,
              styles.rowButton,
              styles.secondary,
              isDisabled && styles.disabled,
            ]}
            onPress={() => setConfirmRemove(false)}
            disabled={isDisabled}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Annuler</Text>
          </Pressable>

          <Pressable
            style={[
              styles.button,
              styles.rowButton,
              styles.primary,
              isDisabled && styles.disabled,
            ]}
            onPress={() => void run(onRemove)}
            disabled={isDisabled}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator
                size="small"
                color={colors.onAccent}
              />
            ) : (
              <Text style={styles.primaryText}>Retirer</Text>
            )}
          </Pressable>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  const label =
    relation.state === 'none'
      ? 'Ajouter'
      : relation.state === 'request_sent'
        ? 'Demande envoyée'
        : 'Amis';

  return (
    <View style={styles.wrapper}>
      <Pressable
        style={[
          styles.button,
          relation.state === 'none'
            ? styles.primary
            : styles.secondary,
          isDisabled && styles.disabled,
        ]}
        onPress={() => {
          if (relation.state === 'none') {
            void run(onSend);
          } else if (relation.state === 'request_sent') {
            withRequestId(onCancel);
          } else {
            setConfirmRemove(true);
            setError('');
          }
        }}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={
          relation.state === 'none'
            ? 'Envoyer une demande d’amitié'
            : relation.state === 'request_sent'
              ? 'Annuler la demande d’amitié'
              : 'Gérer cette amitié'
        }
      >
        {busy ? (
          <ActivityIndicator
            size="small"
            color={
              relation.state === 'none'
                ? colors.onAccent
                : colors.text
            }
          />
        ) : (
          <Text
            style={
              relation.state === 'none'
                ? styles.primaryText
                : styles.secondaryText
            }
            numberOfLines={1}
          >
            {label}
          </Text>
        )}
      </Pressable>

      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'stretch',
    maxWidth: 180,
    flexGrow: 0,
    flexShrink: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  button: {
    minHeight: 40,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  rowButton: {
    flex: 1,
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.border,
  },
  disabled: {
    opacity: 0.6,
  },
  primaryText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  secondaryText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmBox: {
    maxWidth: 200,
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  confirmText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  error: {
    color: colors.accent,
    fontSize: 11,
    marginTop: 6,
  },
});