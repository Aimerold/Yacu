import { supabase } from '@/lib/supabase';

export type GroupMember = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: 'admin' | 'member';
  joined_at: string;
};

export type CreateGroupResult = {
  conversationId: string;
};

export async function createGroup(
  name: string,
  memberIds: string[]
): Promise<CreateGroupResult> {
  const trimmedName = name.trim();

  if (trimmedName.length < 2) {
    throw new Error('Le nom du groupe doit contenir au moins 2 caractères.');
  }

  if (memberIds.length === 0) {
    throw new Error('Sélectionne au moins un membre.');
  }

  const { data, error } = await supabase.rpc('create_group', {
    p_name: trimmedName,
    p_member_ids: memberIds,
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Impossible de créer le groupe.');

  return {
    conversationId: data as string,
  };
}

export async function getGroupMembers(
  conversationId: string
): Promise<GroupMember[]> {
  const { data, error } = await supabase.rpc('get_group_members', {
    p_conversation_id: conversationId,
  });


  if (error) throw new Error(error.message);


  return ((data ?? []) as GroupMember[]).map((member) => ({
    ...member,
    role: member.role === 'admin' ? 'admin' : 'member',
  }));
}


export async function addGroupMembers(
  conversationId: string,
  userIds: string[]
): Promise<void> {
  if (userIds.length === 0) {
    throw new Error('Sélectionne au moins un membre.');
  }

  const { error } = await supabase.rpc('add_group_members', {
    p_conversation_id: conversationId,
    p_user_ids: userIds,
  });


  if (error) throw new Error(error.message);
}

export async function removeGroupMember(
  conversationId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase.rpc('remove_group_member', {
    p_conversation_id: conversationId,
    p_user_id: userId,
  });

  if (error) throw new Error(error.message);
}

export async function leaveGroup(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_group', {
    p_conversation_id: conversationId,
  });

  if (error) throw new Error(error.message);
}

export async function updateGroup(
  conversationId: string,
  name: string,
  avatarUrl: string | null
): Promise<void> {
  const trimmedName = name.trim();

  if (trimmedName.length < 2) {
    throw new Error('Le nom du groupe doit contenir au moins 2 caractères.');
  }

  const { error } = await supabase.rpc('update_group', {
    p_conversation_id: conversationId,
    p_name: trimmedName,
    p_avatar_url: avatarUrl,
  });

  if (error) throw new Error(error.message);
}

export type AvailableUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};


/** Retourne les utilisateurs qui ne sont pas encore membres du groupe. */
export async function getAvailableUsersToAdd(
  conversationId: string,
  search: string = ''
): Promise<AvailableUser[]> {
  const term = search.trim();

  const members = await getGroupMembers(conversationId);
  const memberIds = new Set(
    members.map((member) => member.user_id)
  );

  let query = supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .order('username', { ascending: true })
    .limit(50);

  if (term.length > 0) {
    query = query.or(
      `username.ilike.%${term}%,display_name.ilike.%${term}%`
    );
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  const users = ((data ?? []) as AvailableUser[]).filter(
    (user) => !!user.id && !memberIds.has(user.id)
  );

  return users;
}