let activeConversationId: string | null = null;

/** Mémorise la conversation actuellement ouverte à l'écran (null si aucune). */
export function setActiveConversationId(conversationId: string | null): void {
  activeConversationId = conversationId;
}

export function getActiveConversationId(): string | null {
  return activeConversationId;
}