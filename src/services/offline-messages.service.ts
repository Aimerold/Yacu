import AsyncStorage from '@react-native-async-storage/async-storage';



const PENDING_MESSAGES_KEY = 'yacu.pending_text_messages';



export type PendingTextMessage = {
  id: string;
  conversationId: string;
  content: string;
  createdAt: string;
};



export async function addPendingTextMessage(
  message: PendingTextMessage
): Promise<void> {
  const pending = await getPendingTextMessages();



  const alreadyQueued = pending.some((item) => item.id === message.id);



  if (alreadyQueued) return;



  pending.push(message);



  await AsyncStorage.setItem(
    PENDING_MESSAGES_KEY,
    JSON.stringify(pending)
  );
}



export async function getPendingTextMessages(): Promise<
  PendingTextMessage[]
> {
  const raw = await AsyncStorage.getItem(PENDING_MESSAGES_KEY);



  if (!raw) return [];



  try {
    const parsed = JSON.parse(raw);



    if (!Array.isArray(parsed)) return [];



    return parsed.filter(
      (item): item is PendingTextMessage =>
        !!item &&
        typeof item.id === 'string' &&
        typeof item.conversationId === 'string' &&
        typeof item.content === 'string' &&
        typeof item.createdAt === 'string'
    );
  } catch {
    return [];
  }
}



export async function removePendingTextMessage(
  messageId: string
): Promise<void> {
  const pending = await getPendingTextMessages();



  const next = pending.filter((item) => item.id !== messageId);



  await AsyncStorage.setItem(
    PENDING_MESSAGES_KEY,
    JSON.stringify(next)
  );
}



export async function getPendingTextMessagesForConversation(
  conversationId: string
): Promise<PendingTextMessage[]> {
  const pending = await getPendingTextMessages();



  return pending.filter(
    (item) => item.conversationId === conversationId
  );
}