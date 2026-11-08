import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Avatar from '@/components/ui/Avatar';
import { colors } from '@/theme/tokens';

type Props = {
  onBack: () => void;
  name: string;
  avatarUrl: string | null;
  /** Affiche l'avatar et le nom (faux pendant le chargement de la conversation). */
  showInfo: boolean;
  /** Ligne d'état sous le nom (présence, saisie…). */
  children?: ReactNode;
};

export default function ConversationHeader({
  onBack,
  name,
  avatarUrl,
  showInfo,
  children,
}: Props) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={12}>
        <Text style={styles.back}>← Retour</Text>
      </Pressable>

      {showInfo && (
        <View style={styles.info}>
          <Avatar name={name} uri={avatarUrl} size={44} />

          <View style={styles.text}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {children}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  back: {
    color: colors.accent,
    fontSize: 16,
    marginBottom: 14,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  text: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
});