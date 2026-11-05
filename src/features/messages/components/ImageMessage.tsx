import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getSignedImageUrl } from '@/services/media.service';

type Props = {
  mediaPath: string | null;
  localUri?: string;
  onOpen: () => void;
  onLongPress?: () => void;
};

export default function ImageMessage({
  mediaPath,
  localUri,
  onOpen,
  onLongPress,
}: Props) {
  const [url, setUrl] = useState<string | null>(localUri ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    if (localUri) {
      setUrl(localUri);
    } else if (mediaPath) {
      getSignedImageUrl(mediaPath)
        .then((signed) => {
          if (active) {
            setUrl(signed);
            setFailed(false);
          }
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    }

    return () => {
      active = false;
    };
  }, [mediaPath, localUri]);

  if (failed) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Image indisponible</Text>
      </View>
    );
  }

  if (!url) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color="#FF8A32" />
      </View>
    );
  }

  return (
    <Pressable onPress={onOpen} onLongPress={onLongPress} delayLongPress={350}>
      <Image
        source={{ uri: url }}
        style={styles.image}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  image: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: '#263A54',
  },
  placeholder: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: '#263A54',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#A8B6C8',
    fontSize: 13,
  },
});