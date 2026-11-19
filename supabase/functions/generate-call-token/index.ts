import { createClient } from 'jsr:@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
  'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed.' }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Missing authorization header.' }),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }


  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Invalid session.' }),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  let body: {
    callId?: string;
    conversationId?: string;
  };


  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body.' }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }


  const callId = body.callId;
  const conversationId = body.conversationId;

  if (!callId || !conversationId) {
    return new Response(
      JSON.stringify({
        error: 'callId and conversationId are required.',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }


  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );


  const { data: call, error: callError } = await serviceClient
    .from('calls')
    .select(
      'id, conversation_id, caller_id, callee_id, status'
    )
    .eq('id', callId)
    .eq('conversation_id', conversationId)
    .maybeSingle();


  if (callError || !call) {
    return new Response(
      JSON.stringify({ error: 'Call not found.' }),
      {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }


  if (
    call.caller_id !== user.id &&
    call.callee_id !== user.id
  ) {
    return new Response(
      JSON.stringify({ error: 'Forbidden.' }),
      {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }


  if (call.status !== 'ringing' && call.status !== 'accepted') {
    return new Response(
      JSON.stringify({ error: 'Call is not active.' }),
      {
        status: 409,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  const liveKitUrl = Deno.env.get('LIVEKIT_URL');
  const liveKitApiKey = Deno.env.get('LIVEKIT_API_KEY');
  const liveKitApiSecret = Deno.env.get('LIVEKIT_API_SECRET');


  if (!liveKitUrl || !liveKitApiKey || !liveKitApiSecret) {
    return new Response(
      JSON.stringify({ error: 'LiveKit is not configured.' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  const token = new AccessToken(liveKitApiKey, liveKitApiSecret, {
    identity: user.id,
    ttl: 60 * 60,
  });

  token.addGrant({
    room: `call:${callId}`,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const jwt = await token.toJwt();

  return new Response(
    JSON.stringify({
      url: liveKitUrl,
      token: jwt,
      room: `call:${callId}`,
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  );
});