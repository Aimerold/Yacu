import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Call } from '@/services/call.service';




export function useIncomingCalls() {
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);

  const clearIncomingCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  useEffect(() => {
    let active = true;

    async function subscribe() {
      const { data: sessionData } = await supabase.auth.getSession();

      const userId = sessionData.session?.user.id;

      if (!userId || !active) return;

      const channel = supabase
        .channel(`incoming-calls:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'calls',
            filter: `callee_id=eq.${userId}`,
          },
          (payload) => {
            const call = payload.new as Call;

            if (call.status === 'ringing') {
              setIncomingCall(call);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'calls',
            filter: `callee_id=eq.${userId}`,
          },
          (payload) => {
            const call = payload.new as Call;

            if (
              incomingCall?.id === call.id &&
              call.status !== 'ringing'
            ) {
              setIncomingCall(null);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    let unsubscribe: (() => void) | undefined;

    void subscribe().then((cleanup) => {
      unsubscribe = cleanup;
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [incomingCall?.id]);

  return {
    incomingCall,
    clearIncomingCall,
  };
}