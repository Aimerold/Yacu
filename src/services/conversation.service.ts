
import { supabase } from '@/lib/supabase';

export type ConversationUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type LastMessage = {
  id: string;
  type: 'text' | 'image';
  content: string | null;
  sender_id: string;
  created_at: string;
  mine: boolean;
};

export type ConversationSummary = {
  id: string;
  created_at: string;
  type: 'direct' | 'group';
  name: string | null;
  avatar_url: string | null;
  other_user: ConversationUser | null;
  last_message: LastMessage | null;
  unread_count: number;
};

type ConversationRow = {
  id: string;
  created_at: string;
  user_a_id: string | null;
  user_b_id: string | null;
  created_by: string;
  type: 'direct' | 'group';
  name: string | null;
  avatar_url: string | null;
};

type OverviewRow = {
  conv_id: string;
  last_id: string | null;
  last_type: 'text' | 'image' | null;
  last_content: string | null;
  last_sender_id: string | null;
  last_at: string | null;
  unread_count: number | string;
};

/** Identifiant de l'utilisateur connecté. */
export async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw new Error('Session invalide. Reconnecte-toi.');
  }

  return data.session.user.id;
}

/** Récupère les autres utilisateurs des conversations privées. */
async function loadOtherUsers(
  rows: ConversationRow[],
  me: string
): Promise<Map<string, ConversationUser>> {
  const directRows = rows.filter(
    (row) =>
      row.type === 'direct' &&
      row.user_a_id !== null &&
      row.user_b_id !== null
  );

  if (directRows.length === 0) return new Map();

  const otherIds = [
    ...new Set(
      directRows.map((row) =>
        row.user_a_id === me ? row.user_b_id! : row.user_a_id!
      )
    ),
  ];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', otherIds);

  if (error) throw new Error(error.message);

  return new Map(
    ((data ?? []) as ConversationUser[]).map((profile) => [
      profile.id,
      profile,
    ])
  );
}

function timeOf(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

/** Construit le dernier message depuis l'aperçu Supabase. */
function buildLastMessage(
  info: OverviewRow | undefined,
  me: string
): LastMessage | null {
  if (
    !info ||
    !info.last_id ||
    !info.last_type ||
    !info.last_sender_id ||
    !info.last_at
  ) {
    return null;
  }

  return {
    id: info.last_id,
    type: info.last_type,
    content: info.last_content,
    sender_id: info.last_sender_id,
    created_at: info.last_at,
    mine: info.last_sender_id === me,
  };
}

/** Liste les conversations privées et les groupes. */
export async function getMyConversations(): Promise<
  ConversationSummary[]
> {
  const me = await getCurrentUserId();

  const [conversationsResult, overviewResult] = await Promise.all([
    supabase
      .from('conversations')
      .select(
        'id, created_at, user_a_id, user_b_id, created_by, type, name, avatar_url'
      )
      .eq('is_active', true),

    supabase.rpc('get_conversation_overview'),
  ]);

  if (conversationsResult.error) {
    throw new Error(conversationsResult.error.message);
  }

  if (overviewResult.error) {
    throw new Error(overviewResult.error.message);
  }

  const rows = (conversationsResult.data ?? []) as ConversationRow[];

  const overview = new Map(
    ((overviewResult.data ?? []) as OverviewRow[]).map((row) => [
      row.conv_id,
      row,
    ])
  );

  const users = await loadOtherUsers(rows, me);

  const summaries = rows.map<ConversationSummary>((row) => {
    const otherId =
      row.type === 'direct'
        ? row.user_a_id === me
          ? row.user_b_id
          : row.user_a_id
        : null;

    const info = overview.get(row.id);

    return {
      id: row.id,
      created_at: row.created_at,
      type: row.type,
      name: row.name,
      avatar_url: row.avatar_url,
      other_user: otherId ? users.get(otherId) ?? null : null,
      last_message: buildLastMessage(info, me),
      unread_count: info ? Number(info.unread_count) || 0 : 0,
    };
  });

  return summaries.sort(
    (a, b) =>
      timeOf(b.last_message?.created_at ?? b.created_at) -
      timeOf(a.last_message?.created_at ?? a.created_at)
  );
}


/**
 * Récupère une conversation privée ou un groupe par son identifiant.
 */
export async function getConversationById(
  conversationId: string
): Promise<ConversationSummary | null> {
  const me = await getCurrentUserId();

  const { data, error } = await supabase
    .from('conversations')
    .select(
      'id, created_at, user_a_id, user_b_id, created_by, type, name, avatar_url'
    )
    .eq('id', conversationId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const row = data as ConversationRow;

  // Pour une conversation privée, récupérer le profil de l'autre utilisateur.
  const users = await loadOtherUsers([row], me);

  const otherId =
    row.type === 'direct'
      ? row.user_a_id === me
        ? row.user_b_id
        : row.user_a_id
      : null;

  const otherUser = otherId
    ? users.get(otherId) ?? null
    : null;

  return {
    id: row.id,
    created_at: row.created_at,
    type: row.type,
    name: row.name,
    avatar_url: row.avatar_url,
    other_user: otherUser,
    last_message: null,
    unread_count: 0,
  };
}


/** Crée ou retrouve une conversation privée. */
export async function createDirectConversation(
  otherUserId: string
): Promise<string> {
  const { data, error } = await supabase.rpc(
    'create_direct_conversation',
    {
      p_other_user_id: otherUserId,
    }
  );

  if (error) throw new Error(error.message);

  return data as string;
}

/** Retourne les informations d'un groupe si l'utilisateur en est membre. */
export async function getGroupById(
  conversationId: string
): Promise<ConversationSummary | null> {
  const me = await getCurrentUserId();


  const { data, error } = await supabase
    .from('conversations')
    .select(
      'id, created_at, user_a_id, user_b_id, created_by, type, name, avatar_url'
    )
    .eq('id', conversationId)
    .eq('type', 'group')
    .eq('is_active', true)
    .maybeSingle();


  if (error) throw new Error(error.message);
  if (!data) return null;


  const row = data as ConversationRow;


  return {
    id: row.id,
    created_at: row.created_at,
    type: row.type,
    name: row.name,
    avatar_url: row.avatar_url,
    other_user: null,
    last_message: null,
    unread_count: 0,
  };
}