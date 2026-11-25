// ─── Imports ─────────────────────────────────────────────────────────────

import { fireEvent, render } from '@testing-library/react-native';

// ─── Mocks (hoistés par Jest) ────────────────────────────────────────────

jest.mock('@/features/messages/components/ImageMessage', () => {
  const { View } = require('react-native');
  return function MockImageMessage() {
    return <View testID="mock-image-message" />;
  };
});

jest.mock('@/services/message.service', () => ({
  EDIT_WINDOW_MINUTES: 15,
}));

jest.mock('@/services/receipt.service', () => ({}));

// ─── Imports après mocks ─────────────────────────────────────────────────

import ChatMessageBubble from '@/features/messages/components/ChatMessageBubble';
import type { ChatMessage } from '@/features/messages/types/chat-message';

// ─── Helpers ─────────────────────────────────────────────────────────────

const MY_ID = 'user-me';
const OTHER_ID = 'user-other';

function makeMessage(
  overrides: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    id: 'msg-1',
    conversation_id: 'conv-1',
    sender_id: MY_ID,
    type: 'text',
    content: 'Hello',
    media_path: null,
    created_at: new Date().toISOString(),
    edited_at: null,
    deleted_at: null,
    status: 'sent',
    ...overrides,
  };
}

function noop() {}

async function renderBubble(
  message: ChatMessage,
  options: {
    myId?: string | null;
  } = {}
) {
  const { myId = MY_ID } = options;

  return render(
    <ChatMessageBubble
      message={message}
      myId={myId}
      receipts={null}
      onActions={noop}
      onOpenImage={noop}
      onRetry={noop}
    />
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('ChatMessageBubble — rendu texte', () => {
  it('affiche le contenu du message texte', async () => {
    const { getByText } = await renderBubble(
      makeMessage({ content: 'Bonjour Yacu' })
    );

    expect(getByText('Bonjour Yacu')).toBeTruthy();
  });

  it('affiche l\'heure du message', async () => {
    const { getByText } = await renderBubble(makeMessage());

    expect(getByText(/:/)).toBeTruthy();
  });

  it('affiche "modifié · " si le message a été édité', async () => {
    const { getByText } = await renderBubble(
      makeMessage({
        edited_at: new Date().toISOString(),
        content: 'Message édité',
      })
    );

    expect(getByText(/modifié · /)).toBeTruthy();
  });

  it('n\'affiche pas "modifié · " si le message n\'a pas été édité', async () => {
    const { queryByText } = await renderBubble(
      makeMessage({ edited_at: null })
    );

    expect(queryByText(/modifié · /)).toBeNull();
  });
});

describe('ChatMessageBubble — message supprimé', () => {
  it('affiche "Message supprimé" et pas le contenu', async () => {
    const { getByText, queryByText } = await renderBubble(
      makeMessage({
        content: 'Ce contenu ne doit pas apparaître',
        deleted_at: new Date().toISOString(),
      })
    );

    expect(getByText('Message supprimé')).toBeTruthy();
    expect(
      queryByText('Ce contenu ne doit pas apparaître')
    ).toBeNull();
  });

  it('n\'affiche pas "modifié" pour un message supprimé', async () => {
    const { queryByText } = await renderBubble(
      makeMessage({
        edited_at: new Date().toISOString(),
        deleted_at: new Date().toISOString(),
      })
    );

    expect(queryByText(/modifié · /)).toBeNull();
  });
});

describe('ChatMessageBubble — message image', () => {
  it('rend ImageMessage pour un message de type image', async () => {
    const { getByTestId, queryByText } = await renderBubble(
      makeMessage({
        type: 'image',
        content: null,
        media_path: 'conv-1/user-me/img.jpg',
      })
    );

    expect(getByTestId('mock-image-message')).toBeTruthy();
    expect(queryByText('Hello')).toBeNull();
  });
});

describe('ChatMessageBubble — statuts', () => {
  it('affiche "Envoi…" pour un message pending (mine)', async () => {
    const { getByText } = await renderBubble(
      makeMessage({ status: 'pending' })
    );

    expect(getByText(/Envoi…/)).toBeTruthy();
  });

  it('affiche "Échec de l\'envoi · Réessayer" pour un message failed (mine)', async () => {
    const { getByText } = await renderBubble(
      makeMessage({ status: 'failed' })
    );

    expect(getByText(/Échec de l'envoi · Réessayer/)).toBeTruthy();
  });

  it('n\'affiche pas "Réessayer" pour un message failed d\'un autre', async () => {
    const { queryByText } = await renderBubble(
      makeMessage({
        sender_id: OTHER_ID,
        status: 'failed',
      })
    );

    expect(queryByText(/Échec de l'envoi · Réessayer/)).toBeNull();
  });
});

describe('ChatMessageBubble — interactions', () => {
  it('appelle onRetry au clic sur "Réessayer"', async () => {
    const onRetry = jest.fn();
    const message = makeMessage({ status: 'failed' });

    const { getByText } = await render(
      <ChatMessageBubble
        message={message}
        myId={MY_ID}
        receipts={null}
        onActions={noop}
        onOpenImage={noop}
        onRetry={onRetry}
      />
    );

    fireEvent.press(getByText(/Réessayer/));

    expect(onRetry).toHaveBeenCalledWith(message);
  });
});