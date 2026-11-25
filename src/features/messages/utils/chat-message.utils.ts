import type { ChatMessage } from '@/features/messages/types/chat-message';
import { EDIT_WINDOW_MINUTES } from '@/services/message.service';
import type { PeerReceipts } from '@/services/receipt.service';

function timeOf(message: ChatMessage): number {
  const value = Date.parse(message.created_at);
  return Number.isNaN(value) ? 0 : value;
}

export function upsertMessages(
  list: ChatMessage[],
  incoming: ChatMessage[]
): ChatMessage[] {
  const byId = new Map(
    list.map((message) => [message.id, message])
  );

  for (const message of incoming) {
    const existing = byId.get(message.id);

    byId.set(message.id, {
      ...message,
      localUri: message.localUri ?? existing?.localUri,
    });
  }

  return Array.from(byId.values()).sort(
    (a, b) => timeOf(b) - timeOf(a)
  );
}

export function isPermissionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes('row-level security')
  );
}


const EDIT_WINDOW_MS = EDIT_WINDOW_MINUTES * 60 * 1000;

export function canEditMessage(
  message: ChatMessage,
  myId: string | null
): boolean {
  return (
    !!myId &&
    message.sender_id === myId &&
    message.type === 'text' &&
    message.status === 'sent' &&
    !message.deleted_at &&
    Date.now() - Date.parse(message.created_at) <= EDIT_WINDOW_MS
  );
}

export function canActOnMessage(
  message: ChatMessage,
  myId: string | null
): boolean {
  if (!myId || message.sender_id !== myId || message.deleted_at) {
    return false;
  }

  return message.status === 'sent' || message.status === 'failed';
}

export function deliveryOf(
  message: ChatMessage,
  receipts: PeerReceipts | null
): 'sent' | 'delivered' | 'read' {
  if (!receipts) return 'sent';

  const created = Date.parse(message.created_at);

  if (receipts.readAt !== null && receipts.readAt >= created) {
    return 'read';
  }

  if (
    receipts.deliveredAt !== null &&
    receipts.deliveredAt >= created
  ) {
    return 'delivered';
  }

  return 'sent';
}

export function editErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : '';

  if (text.includes('edit_window_expired')) {
    return `Le délai de modification (${EDIT_WINDOW_MINUTES} minutes) est dépassé.`;
  }

  if (text.includes('forbidden')) {
    return 'Tu ne peux pas modifier ce message.';
  }

  if (text.includes('not_editable')) {
    return 'Ce message ne peut plus être modifié.';
  }

  return 'Impossible de modifier le message. Réessaie.';
}