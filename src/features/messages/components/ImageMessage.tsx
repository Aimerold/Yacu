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
  if (localUri) {
    return (
      <ImageMessageImage
        key={localUri}
        uri={localUri}
        onOpen={onOpen}
        onLongPress={onLongPress}
      />
    );
  }

  if (mediaPath) {
    return (
      <SignedImageMessage
        key={mediaPath}
        mediaPath={mediaPath}
        onOpen={onOpen}
        onLongPress={onLongPress}
      />
    );
  }

  return <ImageMessagePlaceholder kind="error" />;
}

function SignedImageMessage({
  mediaPath,
  onOpen,
  onLongPress,
}: Omit<Props, 'localUri'> & { mediaPath: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

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

    return () => {
      active = false;
    };
  }, [mediaPath]);

  if (failed || !url) {
    return <ImageMessagePlaceholder kind={failed ? 'error' : 'loading'} />;
  }

  return (
    <ImageMessageImage
      key={url}
      uri={url}
      onOpen={onOpen}
      onLongPress={onLongPress}
    />
  );
}

function ImageMessageImage({
  uri,
  onOpen,
  onLongPress,
}: {
  uri: string;
  onOpen: () => void;
  onLongPress?: () => void;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <ImageMessagePlaceholder kind="error" />;
  }

  return (
    <Pressable onPress={onOpen} onLongPress={onLongPress} delayLongPress={350}>
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    </Pressable>
  );
}

function ImageMessagePlaceholder({ kind }: { kind: 'loading' | 'error' }) {
  return (
    <View style={styles.placeholder}>
      {kind === 'error' ? (
        <Text style={styles.placeholderText}>Image indisponible</Text>
      ) : (
        <ActivityIndicator color="#FF8A32" />
      )}
    </View>
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
