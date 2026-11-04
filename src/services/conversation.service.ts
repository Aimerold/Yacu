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
  other_user: ConversationUser | null;
  last_message: LastMessage | null;
  unread_count: number;
};

type ConversationRow = {
  id: string;
  created_at: string;
  user_a_id: string;
  user_b_id: string;
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

/** Identifiant de l'utilisateur connecté (erreur si la session est invalide). */
export async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw new Error('Session invalide. Reconnecte-toi.');
  }

  return data.session.user.id;
}

async function loadOtherUsers(
  rows: ConversationRow[],
  me: string
): Promise<Map<string, ConversationUser>> {
  if (rows.length === 0) return new Map();

  const otherIds = rows.map((row) =>
    row.user_a_id === me ? row.user_b_id : row.user_a_id
  );

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', otherIds);

  if (error) throw new Error(error.message);

  return new Map(
    ((data ?? []) as ConversationUser[]).map((profile) => [profile.id, profile])
  );
}

function timeOf(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

/** Liste les conversations de l'utilisateur, la plus récente d'abord. */
export async function getMyConversations(): Promise<ConversationSummary[]> {
  const me = await getCurrentUserId();

  const [conversationsResult, overviewResult] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, created_at, user_a_id, user_b_id'),
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
    ((overviewResult.data ?? []) as OverviewRow[]).map((row) => [row.conv_id, row])
  );
  const users = await loadOtherUsers(rows, me);

  const summaries = rows.map<ConversationSummary>((row) => {
    const otherId = row.user_a_id === me ? row.user_b_id : row.user_a_id;
    const info = overview.get(row.id);

    const lastMessage: LastMessage | null =
      info && info.last_id && info.last_type && info.last_sender_id && info.last_at
        ? {
            id: info.last_id,
            type: info.last_type,
            content: info.last_content,
            sender_id: info.last_sender_id,
            created_at: info.last_at,
            mine: info.last_sender_id === me,
          }
        : null;

    return {
      id: row.id,
      created_at: row.created_at,
      other_user: users.get(otherId) ?? null,
      last_message: lastMessage,
      unread_count: info ? Number(info.unread_count) || 0 : 0,
    };
  });

  return summaries.sort(
    (a, b) =>
      timeOf(b.last_message?.created_at ?? b.created_at) -
      timeOf(a.last_message?.created_at ?? a.created_at)
  );
}

/** Retourne une conversation si l'utilisateur en est membre, sinon null (RLS). */
export async function getConversationById(
  conversationId: string
): Promise<ConversationSummary | null> {
  const me = await getCurrentUserId();

  const { data, error } = await supabase
    .from('conversations')
    .select('id, created_at, user_a_id, user_b_id')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as ConversationRow;
  const users = await loadOtherUsers([row], me);
  const otherId = row.user_a_id === me ? row.user_b_id : row.user_a_id;

  return {
    id: row.id,
    created_at: row.created_at,
    other_user: users.get(otherId) ?? null,
    last_message: null,
    unread_count: 0,
  };
}

/** Crée (ou retrouve) la conversation directe avec un autre utilisateur. */
export async function createDirectConversation(
  otherUserId: string
): Promise<string> {
  const { data, error } = await supabase.rpc('create_direct_conversation', {
    p_other_user_id: otherUserId,
  });

  if (error) throw new Error(error.message);

  return data as string;
}