import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getDownloadUrl, getSignedImageUrl } from '@/services/media.service';

export type ViewerTarget = {
  mediaPath: string | null;
  localUri?: string;
  canDownload: boolean;
};

type Props = {
  target: ViewerTarget | null;
  onClose: () => void;
};

export default function ImageViewerModal({ target, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;

    setError('');

    if (!target) {
      setUrl(null);
    } else if (target.localUri) {
      setUrl(target.localUri);
    } else if (target.mediaPath) {
      setUrl(null);
      getSignedImageUrl(target.mediaPath)
        .then((signed) => {
          if (active) setUrl(signed);
        })
        .catch(() => {
          if (active) setError('Image indisponible.');
        });
    }

    return () => {
      active = false;
    };
  }, [target]);

  async function handleDownload() {
    if (!target?.mediaPath || downloading) return;

    setDownloading(true);
    setError('');

    try {
      const downloadUrl = await getDownloadUrl(target.mediaPath);
      await Linking.openURL(downloadUrl);
    } catch {
      setError('Impossible de télécharger la photo.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal
      visible={!!target}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Fermer</Text>
          </Pressable>

          {target?.canDownload && !!target.mediaPath && (
            <Pressable onPress={handleDownload} hitSlop={12} disabled={downloading}>
              {downloading ? (
                <ActivityIndicator color="#FF8A32" />
              ) : (
                <Text style={styles.download}>Télécharger</Text>
              )}
            </Pressable>
          )}
        </View>

        <View style={styles.body}>
          {url ? (
            <Image source={{ uri: url }} style={styles.image} resizeMode="contain" />
          ) : error ? null : (
            <ActivityIndicator color="#FF8A32" size="large" />
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  close: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  download: {
    color: '#FF8A32',
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  error: {
    color: '#FF8A32',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});