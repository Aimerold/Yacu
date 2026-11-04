import { supabase } from '@/lib/supabase';

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  type: 'text' | 'image';
  content: string | null;
  media_path: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export const MESSAGE_PAGE_SIZE = 30;
export const MESSAGE_MAX_LENGTH = 5000;

const MESSAGE_COLUMNS =
  'id, conversation_id, sender_id, type, content, media_path, created_at, edited_at, deleted_at';

/**
 * Charge une page de messages, du plus récent au plus ancien.
 * `before` : date du plus ancien message déjà chargé (pagination).
 */
export async function getMessages(
  conversationId: string,
  before?: string,
  limit: number = MESSAGE_PAGE_SIZE
): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data ?? []) as Message[];
}

/**
 * Insère un message. L'identifiant est fourni par le client :
 * un renvoi avec le même identifiant est sans effet (pas de doublon).
 */
async function insertMessage(
  id: string,
  row: Record<string, unknown>
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ id, ...row })
    .select(MESSAGE_COLUMNS)
    .single();

  if (!error) return data as Message;

  // 23505 : le message a déjà été enregistré (réponse perdue lors d'un envoi précédent)
  if (error.code === '23505') {
    const { data: existing, error: fetchError } = await supabase
      .from('messages')
      .select(MESSAGE_COLUMNS)
      .eq('id', id)
      .single();

    if (fetchError) throw new Error(fetchError.message);

    return existing as Message;
  }

  throw new Error(error.message);
}

/** Envoie un message texte. */
export async function sendTextMessage(params: {
  id: string;
  conversationId: string;
  content: string;
}): Promise<Message> {
  const content = params.content.trim();

  if (!content) throw new Error('Message vide.');
  if (content.length > MESSAGE_MAX_LENGTH) throw new Error('Message trop long.');

  return insertMessage(params.id, {
    conversation_id: params.conversationId,
    type: 'text',
    content,
  });
}

/** Enregistre un message image dont le fichier est déjà dans le stockage. */
export async function sendImageMessage(params: {
  id: string;
  conversationId: string;
  mediaPath: string;
}): Promise<Message> {
  return insertMessage(params.id, {
    conversation_id: params.conversationId,
    type: 'image',
    media_path: params.mediaPath,
  });
}

/** Marque la conversation comme lue pour l'utilisateur connecté. */
export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });

  if (error) throw new Error(error.message);
}

/**
 * Écoute les nouveaux messages d'une conversation.
 * `onStatus` reçoit l'état de la connexion (SUBSCRIBED, CLOSED, CHANNEL_ERROR, TIMED_OUT).
 * Retourne une fonction de désabonnement.
 */
export function subscribeToConversationMessages(
  conversationId: string,
  handlers: {
    onInsert: (message: Message) => void;
    onStatus?: (status: string) => void;
  }
): () => void {
  const channel = supabase
    .channel(`chat:${conversationId}:${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => handlers.onInsert(payload.new as unknown as Message)
    )
    .subscribe((status) => handlers.onStatus?.(status));

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Écoute tous les nouveaux messages visibles par l'utilisateur
 * (la RLS ne diffuse que ses conversations). Sert à rafraîchir la liste des chats.
 */
export function subscribeToMyMessages(onInsert: () => void): () => void {
  const channel = supabase
    .channel(`my-messages:${Date.now()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      () => onInsert()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}