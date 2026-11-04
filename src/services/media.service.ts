import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { base64ToArrayBuffer } from '@/utils/base64';

export const CHAT_IMAGES_BUCKET = 'chat-images';
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.7;
const SIGNED_URL_TTL_SECONDS = 3600;
const CACHE_TTL_MS = 50 * 60 * 1000;

/** Erreur dont le message est destiné à l'utilisateur. */
export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaError';
    Object.setPrototypeOf(this, MediaError.prototype);
  }
}

export type PreparedImage = {
  uri: string;
  base64: string;
  width: number;
  height: number;
};

/** Redimensionne et compresse une image sélectionnée (JPEG, 1280 px maximum). */
async function prepareImage(
  asset: ImagePicker.ImagePickerAsset
): Promise<PreparedImage> {
  let result: { uri: string; base64?: string; width: number; height: number };

  try {
    const context = ImageManipulator.manipulate(asset.uri);

    if (asset.width > MAX_DIMENSION) {
      context.resize({ width: MAX_DIMENSION });
    }

    const rendered = await context.renderAsync();

    result = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: JPEG_QUALITY,
      base64: true,
    });
  } catch {
    throw new MediaError('Impossible de préparer la photo.');
  }

  if (!result.base64) {
    throw new MediaError('Impossible de préparer la photo.');
  }

  const estimatedBytes = Math.floor((result.base64.length * 3) / 4);

  if (estimatedBytes > IMAGE_MAX_BYTES) {
    throw new MediaError('Photo trop volumineuse (5 Mo maximum).');
  }

  return {
    uri: result.uri,
    base64: result.base64,
    width: result.width,
    height: result.height,
  };
}

/** Ouvre la galerie. Retourne null si l'utilisateur annule. */
export async function pickImageFromLibrary(): Promise<PreparedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 1,
  });

  if (result.canceled || !result.assets[0]) return null;

  return prepareImage(result.assets[0]);
}

/** Ouvre l'appareil photo. Retourne null si l'utilisateur annule. */
export async function takePhoto(): Promise<PreparedImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();

  if (!permission.granted) {
    throw new MediaError(
      "Autorise l'accès à la caméra dans les réglages de ton téléphone."
    );
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
  });

  if (result.canceled || !result.assets[0]) return null;

  return prepareImage(result.assets[0]);
}

/** Chemin de stockage : <conversation_id>/<sender_id>/<image_id>.jpg */
export function buildChatImagePath(
  conversationId: string,
  userId: string,
  imageId: string
): string {
  return `${conversationId}/${userId}/${imageId}.jpg`;
}

/** Envoie l'image dans le bucket privé. Un renvoi du même fichier est sans effet. */
export async function uploadChatImage(
  path: string,
  base64: string
): Promise<void> {
  const { error } = await supabase.storage
    .from(CHAT_IMAGES_BUCKET)
    .upload(path, base64ToArrayBuffer(base64), {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (!error) return;

  const message = error.message.toLowerCase();

  // Le fichier a déjà été envoyé lors d'une tentative précédente
  if (message.includes('already exists') || message.includes('duplicate')) {
    return;
  }

  throw new Error(error.message);
}

const urlCache = new Map<string, { url: string; expiresAt: number }>();

/** URL signée à durée limitée pour afficher une image (mise en cache). */
export async function getSignedImageUrl(path: string): Promise<string> {
  const cached = urlCache.get(path);

  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from(CHAT_IMAGES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    throw new Error(error?.message ?? 'Image indisponible.');
  }

  urlCache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return data.signedUrl;
}

/** URL signée courte qui déclenche le téléchargement du fichier. */
export async function getDownloadUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(CHAT_IMAGES_BUCKET)
    .createSignedUrl(path, 300, { download: 'yacu-photo.jpg' });

  if (error || !data) {
    throw new Error(error?.message ?? 'Téléchargement indisponible.');
  }

  return data.signedUrl;
}