import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
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
  subscribeToFriendshipChanges,
} from '@/services/friendship.service';
import type {
  FriendRelation,
  FriendshipRequest,
} from '@/services/friendship.service';

const RELOAD_DEBOUNCE_MS = 250;
const POLL_MS = 30000;

type UseFriendshipsOptions = {
  userIds?: string[];
  loadLists?: boolean;
};

function messageFrom(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Une erreur est survenue. Réessaie.';
}

export function useFriendships({
  userIds = [],
  loadLists = true,
}: UseFriendshipsOptions = {}) {
  const userIdsKey = [...new Set(userIds)].sort().join(',');
  const requestKey = `${loadLists}:${userIdsKey}`;

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
  const skipFirstKeyRefresh = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;

      if (reloadTimer.current) {
        clearTimeout(reloadTimer.current);
      }
    };
  }, []);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;

    if (mounted.current && loadedKey.current !== requestKey) {
      setLoading(true);
    }

    try {
      const requestedIds = userIdsKey ? userIdsKey.split(',') : [];

      const [
        nextRelations,
        nextIncomingCount,
        nextIncoming,
        nextOutgoing,
        nextFriends,
      ] = await Promise.all([
        getRelations(requestedIds),
        getIncomingRequestCount(),
        loadLists ? getIncomingRequests() : Promise.resolve(null),
        loadLists ? getOutgoingRequests() : Promise.resolve(null),
        loadLists ? getFriends() : Promise.resolve(null),
      ]);

      if (!mounted.current || sequence !== refreshSequence.current) {
        return;
      }

      setRelations(nextRelations);
      setIncomingCount(nextIncomingCount);

      if (nextIncoming) {
        setIncomingRequests(nextIncoming);
      }

      if (nextOutgoing) {
        setOutgoingRequests(nextOutgoing);
      }

      if (nextFriends) {
        setFriends(nextFriends);
      }

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

  // Utilise la dernière version de refresh sans recréer l'abonnement
  // à chaque changement des résultats de recherche.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Au focus : chargement, Realtime, rechargement périodique
  // et rattrapage au retour au premier plan.
  useFocusEffect(
    useCallback(() => {
      const scheduleRefresh = () => {
        if (reloadTimer.current) {
          clearTimeout(reloadTimer.current);
        }

        reloadTimer.current = setTimeout(() => {
          void refreshRef.current();
        }, RELOAD_DEBOUNCE_MS);
      };

      void refreshRef.current();

      const unsubscribe = subscribeToFriendshipChanges(scheduleRefresh);

      // Les suppressions distantes sont rattrapées par rechargement.
      // Ne lance pas ce rechargement périodique en arrière-plan.
      const poll = setInterval(() => {
        if (AppState.currentState === 'active') {
          void refreshRef.current();
        }
      }, POLL_MS);

      const appState = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          scheduleRefresh();
        }
      });

      return () => {
        if (reloadTimer.current) {
          clearTimeout(reloadTimer.current);
        }

        reloadTimer.current = null;
        clearInterval(poll);
        appState.remove();
        unsubscribe();
      };
    }, [])
  );

  // Recharge lorsque les personnes affichées ou l'option loadLists changent.
  useEffect(() => {
    if (skipFirstKeyRefresh.current) {
      skipFirstKeyRefresh.current = false;
    } else {
      void refresh();
    }
  }, [refresh]);

  /** Exécute une action, recharge et relaie l'erreur de l'action. */
  const runAction = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        await refresh();
      } catch (caught) {
        await refresh();

        if (mounted.current) {
          setError(messageFrom(caught));
        }

        throw caught;
      }
    },
    [refresh]
  );

  const send = useCallback(
    (userId: string) => runAction(() => sendFriendRequest(userId)),
    [runAction]
  );

  const respond = useCallback(
    (requestId: string, accept: boolean) =>
      runAction(() => respondToFriendRequest(requestId, accept)),
    [runAction]
  );

  const cancel = useCallback(
    (requestId: string) => runAction(() => cancelFriendRequest(requestId)),
    [runAction]
  );

  const remove = useCallback(
    (userId: string) => runAction(() => removeFriend(userId)),
    [runAction]
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