import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  cancelFriendRequest,
  getFriends,
  getIncomingRequestCount,
  getIncomingRequests,
  getOutgoingRequests,
  getRelations,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from '@/services/friendship.service';
import type {
  FriendRelation,
  FriendshipRequest,
} from '@/services/friendship.service';
import { subscribeToFriendshipChanges } from '@/services/friendship.service';

type UseFriendshipsOptions = {
  userIds?: string[];
  loadLists?: boolean;
};

function messageFrom(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Une erreur réseau est survenue. Réessaie.';
}

export function useFriendships({
  userIds = [],
  loadLists = true,
}: UseFriendshipsOptions = {}) {
  const userIdsKey = [...new Set(userIds)].sort().join(',');
  const [relations, setRelations] = useState<Map<string, FriendRelation>>(
    () => new Map()
  );
  const [incomingRequests, setIncomingRequests] = useState<
    FriendshipRequest[]
  >([]);
  const [outgoingRequests, setOutgoingRequests] = useState<
    FriendshipRequest[]
  >([]);
  const [friends, setFriends] = useState<FriendshipRequest[]>([]);
  const [incomingCount, setIncomingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshSequence = useRef(0);
  const loadedKey = useRef('');
  const requestKey = `${loadLists}:${userIdsKey}`;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, []);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    if (mounted.current && loadedKey.current !== requestKey) {
      setLoading(true);
    }

    try {
      const requestedIds = userIdsKey ? userIdsKey.split(',') : [];
      const [nextRelations, nextIncomingCount, nextIncoming, nextOutgoing, nextFriends] =
        await Promise.all([
          getRelations(requestedIds),
          getIncomingRequestCount(),
          loadLists ? getIncomingRequests() : Promise.resolve(null),
          loadLists ? getOutgoingRequests() : Promise.resolve(null),
          loadLists ? getFriends() : Promise.resolve(null),
        ]);

      if (!mounted.current || sequence !== refreshSequence.current) return;

      setRelations(nextRelations);
      setIncomingCount(nextIncomingCount);
      if (nextIncoming) setIncomingRequests(nextIncoming);
      if (nextOutgoing) setOutgoingRequests(nextOutgoing);
      if (nextFriends) setFriends(nextFriends);
      loadedKey.current = requestKey;
      setError('');
    } catch (caught) {
      if (mounted.current && sequence === refreshSequence.current) {
        setError(messageFrom(caught));
      }
    } finally {
      if (mounted.current && sequence === refreshSequence.current) {
        setLoading(false);
      }
    }
  }, [loadLists, requestKey, userIdsKey]);

  useFocusEffect(
    useCallback(() => {
      void refresh();

      const unsubscribe = subscribeToFriendshipChanges(() => {
        if (reloadTimer.current) clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(() => {
          void refresh();
        }, 250);
      });

      return () => {
        if (reloadTimer.current) clearTimeout(reloadTimer.current);
        reloadTimer.current = null;
        unsubscribe();
      };
    }, [refresh])
  );

  const send = useCallback(
    async (userId: string) => {
      try {
        await sendFriendRequest(userId);
        await refresh();
      } catch (caught) {
        await refresh();
        const message = messageFrom(caught);
        if (mounted.current) setError(message);
        throw caught;
      }
    },
    [refresh]
  );

  const respond = useCallback(
    async (requestId: string, accept: boolean) => {
      try {
        await respondToFriendRequest(requestId, accept);
        await refresh();
      } catch (caught) {
        await refresh();
        const message = messageFrom(caught);
        if (mounted.current) setError(message);
        throw caught;
      }
    },
    [refresh]
  );

  const cancel = useCallback(
    async (requestId: string) => {
      try {
        await cancelFriendRequest(requestId);
        await refresh();
      } catch (caught) {
        await refresh();
        const message = messageFrom(caught);
        if (mounted.current) setError(message);
        throw caught;
      }
    },
    [refresh]
  );

  const remove = useCallback(
    async (userId: string) => {
      try {
        await removeFriend(userId);
        await refresh();
      } catch (caught) {
        await refresh();
        const message = messageFrom(caught);
        if (mounted.current) setError(message);
        throw caught;
      }
    },
    [refresh]
  );

  const clearError = useCallback(() => setError(''), []);

  return {
    relations,
    incomingRequests,
    outgoingRequests,
    friends,
    incomingCount,
    loading,
    error,
    refresh,
    clearError,
    send,
    respond,
    cancel,
    remove,
  };
}
