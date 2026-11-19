import { supabase } from '@/lib/supabase';

export type LiveKitConnection = {
  url: string;
  token: string;
  room: string;
};


export async function getLiveKitConnection(
  callId: string,
  conversationId: string
): Promise<LiveKitConnection> {
  const { data: session } = await supabase.auth.getSession();

  if (!session.session) {
    throw new Error('Session invalide. Reconnecte-toi.');
  }

  const response = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-call-token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.session.access_token}`,
      },
      body: JSON.stringify({
        callId,
        conversationId,
      }),
    }
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? 'Impossible de rejoindre l’appel.');
  }

  return payload as LiveKitConnection;
}