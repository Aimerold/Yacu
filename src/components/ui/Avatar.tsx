import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/tokens';

type Props = {
  name: string;
  uri?: string | null;
  size?: number;
};

type CommonProps = {
  name: string;
  size: number;
  radius: number;
};

/** Photo de profil, ou initiale du nom si aucune photo n'est disponible. */
export default function Avatar({ name, uri, size = 44 }: Props) {
  const radius = size / 2;

  if (uri) {
    return (
      <AvatarImage
        key={uri}
        name={name}
        size={size}
        radius={radius}
        uri={uri}
      />
    );
  }

  return <AvatarFallback name={name} size={size} radius={radius} />;
}

function AvatarImage({
  name,
  radius,
  size,
  uri,
}: CommonProps & { uri: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <AvatarFallback name={name} size={size} radius={radius} />;
  }

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

function AvatarFallback({ name, radius, size }: CommonProps) {
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
