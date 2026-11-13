import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type AdminClient = ReturnType<typeof createClient>;

const CHAT_BUCKET = 'chat-images';
const AVATARS_BUCKET = 'avatars';
const PAGE = 100;

/** Supprime tous les fichiers d'un dossier d'un bucket. */
async function removeFolderFiles(
  admin: AdminClient,
  bucket: string,
  folder: string
): Promise<void> {
  while (true) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(folder, { limit: PAGE });

    if (error) throw new Error(error.message);

    const files = (data ?? []).filter((entry) => entry.id !== null);

    if (files.length === 0) return;

    const { error: removeError } = await admin.storage
      .from(bucket)
      .remove(files.map((file) => `${folder}/${file.name}`));

    if (removeError) throw new Error(removeError.message);

    if (files.length < PAGE) return;
  }
}

/** Supprime toutes les photos d'une conversation (tous les expéditeurs). */
async function removeConversationImages(
  admin: AdminClient,
  conversationId: string
): Promise<void> {
  const { data, error } = await admin.storage
    .from(CHAT_BUCKET)
    .list(conversationId, { limit: 1000 });

  if (error) throw new Error(error.message);

  // Les sous-dossiers (un par expéditeur) n'ont pas d'identifiant de fichier.
  const senderFolders = (data ?? []).filter((entry) => entry.id === null);

  for (const folder of senderFolders) {
    await removeFolderFiles(admin, CHAT_BUCKET, `${conversationId}/${folder.name}`);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('delete-account: configuration serveur incomplète');
    return json({ error: 'server_misconfigured' }, 500);
  }

  const authorization = request.headers.get('Authorization');

  if (!authorization) {
    return json({ error: 'unauthorized' }, 401);
  }

  // 1. Identité de l'appelant, issue du jeton (jamais du corps de la requête)
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();

  if (userError || !userData.user || !userData.user.email) {
    return json({ error: 'unauthorized' }, 401);
  }

  const user = userData.user;

  // 2. Confirmation par mot de passe, vérifiée ici
  let password = '';

  try {
    const body = await request.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  if (!password) {
    return json({ error: 'invalid_password' }, 403);
  }

  // Client séparé : la vérification ne touche pas à la session de l'appelant
  const verifier = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: passwordError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (passwordError) {
    return json({ error: 'invalid_password' }, 403);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 3. Photos de toutes ses conversations (avant la suppression en cascade)
    const { data: memberships, error: membershipsError } = await admin
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (membershipsError) throw new Error(membershipsError.message);

    for (const membership of memberships ?? []) {
      await removeConversationImages(admin, membership.conversation_id);
    }

    // 4. Photo de profil
    await removeFolderFiles(admin, AVATARS_BUCKET, user.id);

    // 5. Jetons de notification (sans gravité si la table diffère)
    const { error: tokensError } = await admin
      .from('device_tokens')
      .delete()
      .eq('user_id', user.id);

    if (tokensError) {
      console.error('delete-account: jetons non supprimés:', tokensError.message);
    }

    // 6. Profil : supprime en cascade conversations, messages, blocages,
    //    signalements, amitiés, réglages et présence
    const { error: profileError } = await admin
      .from('profiles')
      .delete()
      .eq('id', user.id);

    if (profileError) throw new Error(profileError.message);

    // 7. Compte d'authentification
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

    if (deleteError) throw new Error(deleteError.message);

    return json({ ok: true });
  } catch (e) {
    console.error('delete-account failed:', e);
    return json({ error: 'deletion_failed' }, 500);
  }
});