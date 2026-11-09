import { supabase } from '@/lib/supabase';
import { getCurrentUserId as getSessionUserId } from '@/services/conversation.service';
import type { Profile } from '@/services/profile.service';

export type FriendshipStatus = 'pending' | 'accepted';
export type RelationState =
  | 'none'
  | 'friends'
  | 'request_sent'
  | 'request_received';

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
};

export type FriendshipProfile = Pick<
  Profile,
  'id' | 'username' | 'display_name' | 'avatar_url' | 'bio'
>;

export type FriendshipRequest = Friendship & {
  profile: FriendshipProfile;
};

export type FriendRelation = {
  state: RelationState;
  requestId: string | null;
};

export class FriendshipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FriendshipError';
    Object.setPrototypeOf(this, FriendshipError.prototype);
  }
}

const FRIENDSHIP_COLUMNS =
  'id, requester_id, addressee_id, status, created_at, updated_at';
const PROFILE_COLUMNS = 'id, username, display_name, avatar_url, bio';
let friendshipChannelSequence = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  return '';
}

function isNetworkError(message: string): boolean {
  return /network|fetch|timeout|timed out|offline/i.test(message);
}

function toFriendshipError(error: unknown): FriendshipError {
  if (error instanceof FriendshipError) return error;

  const message = errorMessage(error);
  const code = [
    'not_authenticated',
    'invalid_user',
    'user_not_found',
    'blocked',
    'too_many_requests',
    'request_not_found',
    'not_friends',
    'forbidden',
  ].find((candidate) => message.includes(candidate));

  switch (code) {
    case 'not_authenticated':
      return new FriendshipError(
        'Connecte-toi pour gérer tes amitiés.'
      );

    case 'invalid_user':
      return new FriendshipError(
        'Cet utilisateur ne peut pas être ajouté.'
      );

    case 'user_not_found':
      return new FriendshipError(
        'Cet utilisateur n’existe plus.'
      );

    case 'blocked':
      return new FriendshipError(
        'Cette relation est impossible en raison d’un blocage.'
      );

    case 'too_many_requests':
      return new FriendshipError(
        'Tu as atteint la limite de 50 demandes en attente.'
      );

    case 'request_not_found':
      return new FriendshipError(
        'Cette demande n’existe plus.'
      );

    case 'not_friends':
      return new FriendshipError(
        'Cette personne n’est pas dans tes amis.'
      );

    case 'forbidden':
      return new FriendshipError(
        'Tu ne peux pas effectuer cette action.'
      );

    default:
      return new FriendshipError(
        isNetworkError(message)
          ? 'Connexion impossible. Vérifie ton réseau et réessaie.'
          : 'Une erreur est survenue. Réessaie.'
      );
  }
}

function friendshipFrom(value: unknown): Friendship {
  const row = Array.isArray(value) ? value[0] : value;
  if (
    !isRecord(row) ||
    typeof row.id !== 'string' ||
    typeof row.requester_id !== 'string' ||
    typeof row.addressee_id !== 'string' ||
    (row.status !== 'pending' && row.status !== 'accepted') ||
    typeof row.created_at !== 'string' ||
    typeof row.updated_at !== 'string'
  ) {
    throw new FriendshipError('Réponse serveur invalide. Réessaie.');
  }
  return row as Friendship;
}

/** Identifiant de l'utilisateur connecté, lu dans la session locale (sans appel réseau). */
async function getCurrentUserId(): Promise<string> {
  try {
    return await getSessionUserId();
  } catch {
    throw new FriendshipError('Connecte-toi pour gérer tes amitiés.');
  }
}

async function getProfilesById(
  userIds: string[]
): Promise<Map<string, FriendshipProfile>> {
  if (userIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .in('id', userIds);

  if (error) throw toFriendshipError(error);

  const profiles = (data ?? []) as FriendshipProfile[];
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

/** Associe chaque relation au profil de l'autre personne ; un profil introuvable est ignoré. */
function attachProfiles(
  friendships: Friendship[],
  profiles: Map<string, FriendshipProfile>,
  otherUserId: (friendship: Friendship) => string
): FriendshipRequest[] {
  return friendships.flatMap((friendship) => {
    const profile = profiles.get(otherUserId(friendship));

    return profile ? [{ ...friendship, profile }] : [];
  });
}

export async function sendFriendRequest(
  userId: string
): Promise<Friendship> {
  const { data, error } = await supabase.rpc('send_friend_request', {
    p_user_id: userId,
  });

  if (error) throw toFriendshipError(error);

  try {
    return friendshipFrom(data);
  } catch (caught) {
    throw toFriendshipError(caught);
  }
}

export async function respondToFriendRequest(
  requestId: string,
  accept: boolean
): Promise<'accepted' | 'declined'> {
  const { data, error } = await supabase.rpc('respond_friend_request', {
    p_request_id: requestId,
    p_accept: accept,
  });

  if (error) throw toFriendshipError(error);
  if (data !== 'accepted' && data !== 'declined') {
    throw new FriendshipError('Réponse serveur invalide. Réessaie.');
  }
  return data;
}

export async function cancelFriendRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_friend_request', {
    p_request_id: requestId,
  });

  if (error) throw toFriendshipError(error);
}

export async function removeFriend(userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_friend', {
    p_user_id: userId,
  });

  if (error) throw toFriendshipError(error);
}

export async function getRelations(
  userIds: string[]
): Promise<Map<string, FriendRelation>> {
  try {
    const ids = [...new Set(userIds)];
    const relations = new Map<string, FriendRelation>(
      ids.map((id) => [id, { state: 'none', requestId: null }])
    );
    if (ids.length === 0) return relations;

    const [currentUserId, requestedByMe, requestedToMe] = await Promise.all([
      getCurrentUserId(),
      supabase
        .from('friendships')
        .select(FRIENDSHIP_COLUMNS)
        .in('requester_id', ids),
      supabase
        .from('friendships')
        .select(FRIENDSHIP_COLUMNS)
        .in('addressee_id', ids),
    ]);

    if (requestedByMe.error) throw requestedByMe.error;
    if (requestedToMe.error) throw requestedToMe.error;

    const friendshipRows = new Map<string, Friendship>();
    for (const friendship of [
      ...((requestedByMe.data ?? []) as Friendship[]),
      ...((requestedToMe.data ?? []) as Friendship[]),
    ]) {
      friendshipRows.set(friendship.id, friendship);
    }

    for (const friendship of friendshipRows.values()) {
      const otherUserId =
        friendship.requester_id === currentUserId
          ? friendship.addressee_id
          : friendship.requester_id;
      if (!relations.has(otherUserId)) continue;

      relations.set(otherUserId, {
        state:
          friendship.status === 'accepted'
            ? 'friends'
            : friendship.requester_id === currentUserId
              ? 'request_sent'
              : 'request_received',
        requestId: friendship.id,
      });
    }

    return relations;
  } catch (error) {
    throw toFriendshipError(error);
  }
}

export async function getIncomingRequests(): Promise<FriendshipRequest[]> {
  try {
    const currentUserId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('friendships')
      .select(FRIENDSHIP_COLUMNS)
      .eq('addressee_id', currentUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const friendships = (data ?? []) as Friendship[];
    const profiles = await getProfilesById(
      friendships.map((friendship) => friendship.requester_id)
    );
    return attachProfiles(
      friendships,
      profiles,
      (friendship) => friendship.requester_id
    );
  } catch (error) {
    throw toFriendshipError(error);
  }
}

export async function getOutgoingRequests(): Promise<FriendshipRequest[]> {
  try {
    const currentUserId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('friendships')
      .select(FRIENDSHIP_COLUMNS)
      .eq('requester_id', currentUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const friendships = (data ?? []) as Friendship[];
    const profiles = await getProfilesById(
      friendships.map((friendship) => friendship.addressee_id)
    );
    return attachProfiles(
      friendships,
      profiles,
      (friendship) => friendship.addressee_id
    );
  } catch (error) {
    throw toFriendshipError(error);
  }
}

export async function getFriends(): Promise<FriendshipRequest[]> {
  try {
    const currentUserId = await getCurrentUserId();
    const [requestedByMe, requestedToMe] = await Promise.all([
      supabase
        .from('friendships')
        .select(FRIENDSHIP_COLUMNS)
        .eq('requester_id', currentUserId)
        .eq('status', 'accepted'),
      supabase
        .from('friendships')
        .select(FRIENDSHIP_COLUMNS)
        .eq('addressee_id', currentUserId)
        .eq('status', 'accepted'),
    ]);

    if (requestedByMe.error) throw requestedByMe.error;
    if (requestedToMe.error) throw requestedToMe.error;

    const friendships = [
      ...((requestedByMe.data ?? []) as Friendship[]),
      ...((requestedToMe.data ?? []) as Friendship[]),
    ];
    const otherUserOf = (friendship: Friendship) =>
      friendship.requester_id === currentUserId
        ? friendship.addressee_id
        : friendship.requester_id;

    const profiles = await getProfilesById(friendships.map(otherUserOf));

    return attachProfiles(friendships, profiles, otherUserOf);
  } catch (error) {
    throw toFriendshipError(error);
  }
}

export async function getIncomingRequestCount(): Promise<number> {
  try {
    const currentUserId = await getCurrentUserId();
    const { count, error } = await supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('addressee_id', currentUserId)
      .eq('status', 'pending');

    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    throw toFriendshipError(error);
  }
}

/**
 * Écoute les créations et modifications de mes relations.
 * Les suppressions ne sont pas écoutées (leurs événements ne sont pas filtrés par la RLS) :
 * elles se voient par rechargement. `onChange` est aussi appelée à chaque (re)connexion
 * du canal, pour rattraper les événements manqués.
 */
export function subscribeToFriendshipChanges(
  onChange: () => void
): () => void {
  let cancelled = false;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  void getSessionUserId()
    .then((userId) => {
      if (cancelled) return;

      channel = supabase
        .channel(`friendships:${userId}:${++friendshipChannelSequence}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'friendships',
            filter: `addressee_id=eq.${userId}`,
          },
          onChange
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'friendships',
            filter: `requester_id=eq.${userId}`,
          },
          onChange
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'friendships',
            filter: `addressee_id=eq.${userId}`,
          },
          onChange
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'friendships',
            filter: `requester_id=eq.${userId}`,
          },
          onChange
        )
        .subscribe((status, subscribeError) => {
          if (status === 'SUBSCRIBED') {
            onChange();
            return;
          }

          if (
            subscribeError ||
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT'
          ) {
            console.error(
              'Le temps réel des amitiés est indisponible :',
              subscribeError ?? status
            );
          }
        });
    })
    .catch((error: unknown) => {
      console.error(
        'Impossible de configurer le temps réel des amitiés :',
        error
      );
    });

  return () => {
    cancelled = true;

    if (channel) {
      void supabase.removeChannel(channel).catch((error: unknown) => {
        console.error('Impossible de fermer le canal des amitiés :', error);
      });
    }
  };
}