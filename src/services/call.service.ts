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
  status: 'ringing' | 'accepted' | 'declined' | 'cancelled' | 'missed';
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  current_user_id: string;
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
  const { data, error } = await supabase.rpc('start_call', {
    p_conversation_id: conversationId,
    p_callee_id: calleeId,
  });

  if (error) {
    if (error.message.includes('call_already_ringing')) {
      throw new Error('Un appel est déjà en cours dans cette conversation.');
    }

    throw new Error(error.message);
  }

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

/** Marque un appel comme manqué après un délai sans réponse. */
export async function markCallMissed(callId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_call_missed', {
    p_call_id: callId,
  });

  if (error) throw new Error(error.message);
}

/** Récupère le dernier appel d'une conversation. */
export async function getLatestCall(
  conversationId: string
): Promise<Call | null> {
  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Call | null;
}


/** Récupère l'appel et les informations du correspondant. */
export async function getCallWithParticipant(callId: string) {
  const { data: sessionData } = await supabase.auth.getSession();

  const currentUserId = sessionData.session?.user.id;

  if (!currentUserId) {
    throw new Error('Utilisateur non connecté.');
  }

  const { data, error } = await supabase
    .from('calls')
    .select(
      `
      id,
      conversation_id,
      caller_id,
      callee_id,
      status,
      created_at,
      started_at,
      ended_at,
      caller:profiles!calls_caller_id_fkey(
        id,
        full_name,
        avatar_url
      ),
      callee:profiles!calls_callee_id_fkey(
        id,
        full_name,
        avatar_url
      )
    `
    )
    .eq('id', callId)
    .single();

  if (error) throw new Error(error.message);

  if (!data) {
    throw new Error('Appel introuvable.');
  }

  const isCaller = data.caller_id === currentUserId;

  const participantData = isCaller ? data.callee : data.caller;

  const participant = Array.isArray(participantData)
    ? participantData[0]
    : participantData;

  if (!participant) {
    throw new Error('Correspondant introuvable.');
  }

  return {
    call: data,
    participant: {
      id: participant.id,
      fullName: participant.full_name,
      avatarUrl: participant.avatar_url,
    },
  };
}


/** Récupère l'historique des appels de l'utilisateur. */
export async function getCallHistory() {
  const currentUserId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('calls')
    .select(
      `
      id,
      conversation_id,
      caller_id,
      callee_id,
      status,
      created_at,
      started_at,
      ended_at,
      caller:profiles!calls_caller_id_fkey(
        id,
        full_name,
        avatar_url
      ),
      callee:profiles!calls_callee_id_fkey(
        id,
        full_name,
        avatar_url
      )
    `
    )
    .or(`caller_id.eq.${currentUserId},callee_id.eq.${currentUserId}`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return (data ?? []).map((item) => {
    const isCaller = item.caller_id === currentUserId;
    const participantData = isCaller ? item.callee : item.caller;
    const participant = Array.isArray(participantData)
      ? participantData[0]
      : participantData;

    return {
      id: item.id,
      conversationId: item.conversation_id,
      status: item.status,
      createdAt: item.created_at,
      startedAt: item.started_at,
      endedAt: item.ended_at,
      isIncoming: !isCaller,
      participantName: participant?.full_name || 'Utilisateur',
      participantAvatar: participant?.avatar_url || null,
    };
  });
}