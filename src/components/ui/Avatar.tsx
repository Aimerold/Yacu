import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/tokens';

type Props = {
  name: string;
  uri?: string | null;
  size?: number;
};

/** Photo de profil, ou initiale du nom si aucune photo n'est disponible. */
export default function Avatar({ name, uri, size = 44 }: Props) {
  const [failed, setFailed] = useState(false);
  const radius = size / 2;

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: colors.border,
        }}
        onError={() => setFailed(true)}
      />
    );
  }

  const initial = (name.trim().charAt(0) || '?').toUpperCase();

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: radius },
      ]}
    >
      <Text style={[styles.initial, { fontSize: Math.round(size * 0.42) }]}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: colors.accent,
    fontWeight: '700',
  },
});