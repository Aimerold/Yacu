import { supabase } from '@/lib/supabase';

/** Horodatages (en millisecondes) du correspondant ; null si inconnus ou masqués. */
export type PeerReceipts = {
  deliveredAt: number | null;
  readAt: number | null;
};

type PeerReceiptsRow = {
  peer_delivered_at: string | null;
  peer_read_at: string | null;
};

function toTime(value: string | null | undefined): number | null {
  if (!value) return null;

  const time = Date.parse(value);

  return Number.isNaN(time) ? null : time;
}

/** Reçu / lu du correspondant (le serveur applique ses réglages de confidentialité). */
export async function getPeerReceipts(
  conversationId: string
): Promise<PeerReceipts | null> {
  const { data, error } = await supabase.rpc('get_peer_receipts', {
    p_conversation_id: conversationId,
  });

  if (error) throw new Error(error.message);

  const row = ((data ?? []) as PeerReceiptsRow[])[0];

  if (!row) return null;

  return {
    deliveredAt: toTime(row.peer_delivered_at),
    readAt: toTime(row.peer_read_at),
  };
}

/** Marque toutes mes conversations comme « reçues ». */
export async function markAllDelivered(): Promise<void> {
  const { error } = await supabase.rpc('mark_all_delivered');

  if (error) throw new Error(error.message);
}