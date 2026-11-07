import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const ANDROID_CHANNEL_ID = 'messages';
const BODY_MAX_LENGTH = 120;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Comparaison à durée constante, pour ne pas révéler le secret par le temps de réponse. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;

  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

type ExpoTicket = {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!secret || !supabaseUrl || !serviceKey) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  // 1. Authentification de l'appelant (le webhook de la base)
  const provided = request.headers.get('x-webhook-secret') ?? '';

  if (!safeEqual(provided, secret)) {
    return json({ error: 'unauthorized' }, 401);
  }

  // 2. Identifiant du message, seul élément repris de la requête
  let messageId: unknown;

  try {
    const body = await request.json();
    messageId = body?.record?.id ?? body?.message_id;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  if (typeof messageId !== 'string') {
    return json({ error: 'bad_request' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 3. Le message, relu en base
    const { data: message } = await admin
      .from('messages')
      .select('id, conversation_id, sender_id, type, content, deleted_at')
      .eq('id', messageId)
      .maybeSingle();

    if (!message || message.deleted_at) {
      return json({ skipped: 'message_unavailable' });
    }

    const { data: conversation } = await admin
      .from('conversations')
      .select('user_a_id, user_b_id')
      .eq('id', message.conversation_id)
      .maybeSingle();

    if (!conversation) {
      return json({ skipped: 'conversation_unavailable' });
    }

    const recipientId =
      conversation.user_a_id === message.sender_id
        ? conversation.user_b_id
        : conversation.user_a_id;

    // 4. Blocage dans un sens ou dans l'autre
    const { data: blocks } = await admin
      .from('blocked_users')
      .select('blocker_id')
      .or(
        `and(blocker_id.eq.${recipientId},blocked_id.eq.${message.sender_id}),` +
          `and(blocker_id.eq.${message.sender_id},blocked_id.eq.${recipientId})`
      )
      .limit(1);

    if (blocks && blocks.length > 0) {
      return json({ skipped: 'blocked' });
    }

    // 5. Réglage du destinataire
    const { data: settings } = await admin
      .from('user_settings')
      .select('push_notifications_enabled')
      .eq('user_id', recipientId)
      .maybeSingle();

    if (settings && settings.push_notifications_enabled === false) {
      return json({ skipped: 'notifications_disabled' });
    }

    // 6. Appareils du destinataire
    const { data: devices } = await admin
      .from('device_tokens')
      .select('expo_push_token')
      .eq('user_id', recipientId);

    const tokens: string[] = (devices ?? []).map(
      (device: { expo_push_token: string }) => device.expo_push_token
    );

    if (tokens.length === 0) {
      return json({ skipped: 'no_device' });
    }

    // 7. Un seul envoi par message : on « réserve » le message
    const { data: claimed } = await admin
      .from('push_deliveries')
      .upsert({ message_id: message.id }, { onConflict: 'message_id', ignoreDuplicates: true })
      .select('message_id');

    if (!claimed || claimed.length === 0) {
      return json({ skipped: 'already_sent' });
    }

    // 8. Contenu de la notification
    const { data: sender } = await admin
      .from('profiles')
      .select('display_name, username')
      .eq('id', message.sender_id)
      .maybeSingle();

    const title = sender?.display_name || sender?.username || 'Yacu';

    const body =
      message.type === 'image'
        ? '📷 Photo'
        : String(message.content ?? '').slice(0, BODY_MAX_LENGTH);

    const payloads = tokens.map((token) => ({
      to: token,
      title,
      body,
      sound: 'default',
      priority: 'high',
      channelId: ANDROID_CHANNEL_ID,
      data: {
        conversationId: message.conversation_id,
        messageId: message.id,
      },
    }));

    // 9. Envoi
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payloads),
    });

    const result = (await response.json()) as { data?: ExpoTicket[] };
    const tickets = result.data ?? [];

    // 10. Nettoyage des jetons qui ne sont plus valides
    const invalid = tickets
      .map((ticket, index) => ({ ticket, token: tokens[index] }))
      .filter(
        ({ ticket }) =>
          ticket.status === 'error' &&
          ticket.details?.error === 'DeviceNotRegistered'
      )
      .map(({ token }) => token);

    if (invalid.length > 0) {
      await admin.from('device_tokens').delete().in('expo_push_token', invalid);
    }

    return json({ sent: tickets.filter((t) => t.status === 'ok').length });
  } catch (error) {
    console.error('send-push-notification failed:', error);
    return json({ error: 'push_failed' }, 500);
  }
});