import { useEffect } from 'react';
import { setActiveConversationId } from '@/lib/active-conversation';

/** À appeler depuis l'écran de conversation : elle est « ouverte » tant qu'il est affiché. */
export function useActiveConversation(conversationId: string | undefined): void {
  useEffect(() => {
    setActiveConversationId(conversationId ?? null);

    return () => {
      setActiveConversationId(null);
    };
  }, [conversationId]);
}


