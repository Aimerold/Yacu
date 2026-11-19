import { supabase } from '@/lib/supabase';

export type CallStatus =
  | 'ringing'
  | 'accepted'
  | 'declined'
  | 'missed'
  | 'ended'
  | 'failed'
  | 'cancelled';

export type Call = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  status: CallStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();


  if (error || !data.session) {
    throw new Error('Session invalide. Reconnecte-toi.');
  }

  return data.session.user.id;
}

/** Démarre un appel audio dans une conversation privée. */
export async function startAudioCall(
  conversationId: string,
  calleeId: string
): Promise<Call> {
  const callerId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('calls')
    .insert({
      conversation_id: conversationId,
      caller_id: callerId,
      callee_id: calleeId,
      status: 'ringing',
    })
    .select(
      'id, conversation_id, caller_id, callee_id, status, started_at, ended_at, created_at'
    )
    .single();

  if (error) throw new Error(error.message);

  return data as Call;
}

/** Met à jour le statut d'un appel via la fonction sécurisée. */
export async function updateCallStatus(
  callId: string,
  status: Exclude<CallStatus, 'ringing'>
): Promise<void> {
  const { error } = await supabase.rpc('update_call_status', {
    p_call_id: callId,
    p_new_status: status,
  });

  
  if (error) throw new Error(error.message);
}

/** Retourne les informations d'un appel. */
export async function getCallById(callId: string): Promise<Call | null> {
  const { data, error } = await supabase
    .from('calls')
    .select(
      'id, conversation_id, caller_id, callee_id, status, started_at, ended_at, created_at'
    )
    .eq('id', callId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data as Call | null) ?? null;
}