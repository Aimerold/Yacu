import { createClient } from 'npm:@supabase/supabase-js@2';



const SUPABASE_SECRET_KEYS = JSON.parse(
  Deno.env.get('SUPABASE_SECRET_KEYS')!
);


const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  SUPABASE_SECRET_KEYS['default']
);



Deno.serve(async (req) => {
  try {
    const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
    const providedSecret = req.headers.get('x-webhook-secret');


    if (
      !webhookSecret ||
      !providedSecret ||
      providedSecret !== webhookSecret
    ) {
      return new Response('unauthorized', { status: 401 });
    }


    const payload = await req.json();


    const call = payload.record;



    if (!call || call.status !== 'ringing') {
      return new Response('ignored', { status: 200 });
    }


    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', call.callee_id);


    if (!tokens || tokens.length === 0) {
      return new Response('no_tokens', { status: 200 });
    }


    const { data: caller } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', call.caller_id)
      .single();


    const callerName = caller?.full_name || 'Quelqu’un';


    const messages = tokens.map((item) => ({
      to: item.token,
      sound: 'default',
      title: 'Appel entrant',
      body: `${callerName} t’appelle`,
      data: {
        type: 'incoming_call',
        callId: call.id,
        conversationId: call.conversation_id,
      },
    }));


    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });


    return new Response('sent', { status: 200 });
  } catch {
    return new Response('error', { status: 500 });
  }
});