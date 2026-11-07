import { StyleSheet, Text, View } from 'react-native';
import { formatLastSeen } from '@/utils/format';
import type { PresenceInfo } from '@/services/presence.service';
import { colors } from '@/theme/tokens';

const ONLINE_GREEN = '#16A34A';

type Props = {
  typing: boolean;
  presence: PresenceInfo | null;
  /** Texte affiché quand rien n'est visible (par exemple @username). */
  fallback?: string;
};

/** État du correspondant : écrit… > en ligne > vu à… > texte de repli. */
export default function PresenceLabel({ typing, presence, fallback }: Props) {
  if (typing) {
    return <Text style={[styles.text, styles.typing]}>en train d'écrire…</Text>;
  }

  if (presence?.isOnline) {
    return (
      <View style={styles.row}>
        <View style={styles.dot} />
        <Text style={styles.text}>en ligne</Text>
      </View>
    );
  }

  if (presence?.lastSeenAt) {
    const label = formatLastSeen(presence.lastSeenAt);

    if (label) return <Text style={styles.text}>{label}</Text>;
  }

  return fallback ? <Text style={styles.text}>{fallback}</Text> : null;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ONLINE_GREEN,
  },
  text: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 3,
  },
  typing: {
    color: colors.accent,
    fontStyle: 'italic',
  },
});