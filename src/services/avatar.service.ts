import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { getCurrentUserId } from '@/services/conversation.service';
import { MediaError } from '@/services/media.service';
import { base64ToArrayBuffer } from '@/utils/base64';
import { generateId } from '@/utils/id';

export const AVATARS_BUCKET = 'avatars';

const AVATAR_SIZE = 512;
const AVATAR_QUALITY = 0.8;
const AVATAR_MAX_BYTES = 1024 * 1024;

export type PreparedAvatar = {
  uri: string;
  base64: string;
};

/** Recadre en carré (centre), réduit à 512 px et compresse en JPEG. */
async function prepareAvatar(
  asset: ImagePicker.ImagePickerAsset
): Promise<PreparedAvatar> {
  let result: { uri: string; base64?: string };

  try {
    const side = Math.min(asset.width, asset.height);
    const context = ImageManipulator.manipulate(asset.uri);

    context.crop({
      originX: Math.floor((asset.width - side) / 2),
      originY: Math.floor((asset.height - side) / 2),
      width: side,
      height: side,
    });

    if (side > AVATAR_SIZE) {
      context.resize({ width: AVATAR_SIZE });
    }

    const rendered = await context.renderAsync();

    result = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: AVATAR_QUALITY,
      base64: true,
    });
  } catch {
    throw new MediaError('Impossible de préparer la photo.');
  }

  if (!result.base64) {
    throw new MediaError('Impossible de préparer la photo.');
  }

  if (Math.floor((result.base64.length * 3) / 4) > AVATAR_MAX_BYTES) {
    throw new MediaError('Photo trop volumineuse.');
  }

  return { uri: result.uri, base64: result.base64 };
}

/** Choisit une photo (galerie ou caméra). Retourne null si l'utilisateur annule. */
export async function pickAvatar(
  source: 'library' | 'camera'
): Promise<PreparedAvatar | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      throw new MediaError(
        "Autorise l'accès à la caméra dans les réglages de ton téléphone."
      );
    }
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets[0]) return null;

  return prepareAvatar(result.assets[0]);
}

async function readAvatarUrl(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data as { avatar_url: string | null } | null)?.avatar_url ?? null;
}

/** Chemin du fichier dans le bucket, déduit de son adresse publique. */
function pathFromAvatarUrl(url: string): string | null {
  const marker = `/object/public/${AVATARS_BUCKET}/`;
  const index = url.indexOf(marker);

  return index === -1 ? null : url.slice(index + marker.length);
}

/** Supprime un ancien fichier ; sans gravité en cas d'échec. */
async function removeStoredAvatar(url: string | null): Promise<void> {
  if (!url) return;

  const path = pathFromAvatarUrl(url);

  if (!path) return;

  try {
    await supabase.storage.from(AVATARS_BUCKET).remove([path]);
  } catch {
    // Le fichier restera orphelin : sans conséquence visible.
  }
}

/** Envoie la photo, met à jour le profil et supprime l'ancienne. Retourne la nouvelle adresse. */
export async function setAvatar(prepared: PreparedAvatar): Promise<string> {
  const userId = await getCurrentUserId();
  const previousUrl = await readAvatarUrl(userId);

  // Nouveau fichier à chaque fois : l'adresse change, aucun cache périmé.
  const path = `${userId}/${generateId()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, base64ToArrayBuffer(prepared.base64), {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (uploadError) {
    throw new MediaError("Impossible d'envoyer la photo. Réessaie.");
  }

  const url = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path).data
    .publicUrl;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: url })
    .eq('id', userId);

  if (updateError) {
    // Le profil n'a pas changé : on retire le fichier qu'on vient d'envoyer.
    await removeStoredAvatar(url);
    throw new MediaError("Impossible d'enregistrer la photo. Réessaie.");
  }

  await removeStoredAvatar(previousUrl);

  return url;
}

/** Retire la photo de profil (le profil revient à l'initiale). */
export async function removeAvatar(): Promise<void> {
  const userId = await getCurrentUserId();
  const previousUrl = await readAvatarUrl(userId);

  if (!previousUrl) return;

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', userId);

  if (error) {
    throw new MediaError('Impossible de supprimer la photo. Réessaie.');
  }

  await removeStoredAvatar(previousUrl);
}