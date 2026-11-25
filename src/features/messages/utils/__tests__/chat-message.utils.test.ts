jest.mock('@/services/message.service', () => ({
  EDIT_WINDOW_MINUTES: 15,
}));

jest.mock('@/services/receipt.service', () => ({}));



import type { ChatMessage } from '@/features/messages/types/chat-message';
import {
    canActOnMessage,
    canEditMessage,
    deliveryOf,
    editErrorMessage,
    isPermissionError,
    upsertMessages,
} from '@/features/messages/utils/chat-message.utils';
import type { PeerReceipts } from '@/services/receipt.service';

// ─── Helpers ─────────────────────────────────────────────────────────────

const MY_ID = 'user-me';
const OTHER_ID = 'user-other';

/** Crée un ChatMessage avec des valeurs par défaut surchargeables. */
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

/** Date ISO il y a N minutes. */
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

/** Date ISO il y a N secondes. */
function secondsAgo(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

function makeReceipts(
  overrides: Partial<PeerReceipts> = {}
): PeerReceipts {
  return {
    deliveredAt: null,
    readAt: null,
    ...overrides,
  };
}

// ─── upsertMessages ──────────────────────────────────────────────────────

describe('upsertMessages', () => {
  it('ajoute un message dans une liste vide', () => {
    const message = makeMessage({ id: 'a' });

    const result = upsertMessages([], [message]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('met à jour un message existant par id', () => {
    const original = makeMessage({ id: 'a', content: 'old' });
    const updated = makeMessage({ id: 'a', content: 'new' });

    const result = upsertMessages([original], [updated]);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('new');
  });

  it('ne crée pas de doublon quand on upsert le même id', () => {
    const message = makeMessage({ id: 'a' });

    const result = upsertMessages([message], [message]);

    expect(result).toHaveLength(1);
  });

  it('préserve le localUri existant si le nouveau message n\'en a pas', () => {
    const original = makeMessage({
      id: 'a',
      localUri: 'file://local.jpg',
    });
    const updated = makeMessage({
      id: 'a',
      localUri: undefined,
    });

    const result = upsertMessages([original], [updated]);

    expect(result[0].localUri).toBe('file://local.jpg');
  });

  it('remplace le localUri si le nouveau message en a un', () => {
    const original = makeMessage({
      id: 'a',
      localUri: 'file://old.jpg',
    });
    const updated = makeMessage({
      id: 'a',
      localUri: 'file://new.jpg',
    });

    const result = upsertMessages([original], [updated]);

    expect(result[0].localUri).toBe('file://new.jpg');
  });

  it('trie les messages du plus récent au plus ancien', () => {
    const old = makeMessage({
      id: 'old',
      created_at: minutesAgo(10),
    });
    const recent = makeMessage({
      id: 'recent',
      created_at: minutesAgo(1),
    });

    const result = upsertMessages([], [old, recent]);

    expect(result[0].id).toBe('recent');
    expect(result[1].id).toBe('old');
  });

  it('gère les dates invalides (les place en dernier)', () => {
    const valid = makeMessage({
      id: 'valid',
      created_at: minutesAgo(1),
    });
    const invalid = makeMessage({
      id: 'invalid',
      created_at: 'not-a-date',
    });

    const result = upsertMessages([], [valid, invalid]);

    expect(result[0].id).toBe('valid');
    expect(result[1].id).toBe('invalid');
  });

  it('ne modifie pas le tableau d\'entrée (immutabilité)', () => {
    const original = makeMessage({ id: 'a' });
    const list = [original];
    const snapshot = [...list];

    upsertMessages(list, [makeMessage({ id: 'b' })]);

    expect(list).toEqual(snapshot);
  });
});

// ─── isPermissionError ───────────────────────────────────────────────────

describe('isPermissionError', () => {
  it('retourne true pour une erreur RLS', () => {
    const error = new Error(
      'new row violates row-level security policy'
    );

    expect(isPermissionError(error)).toBe(true);
  });

  it('retourne true même si la casse diffère', () => {
    const error = new Error('ROW-LEVEL SECURITY violation');

    expect(isPermissionError(error)).toBe(true);
  });

  it('retourne false pour une erreur réseau', () => {
    const error = new Error('Network request failed');

    expect(isPermissionError(error)).toBe(false);
  });

  it('retourne false pour une valeur non-Error', () => {
    expect(isPermissionError('some string')).toBe(false);
    expect(isPermissionError(null)).toBe(false);
    expect(isPermissionError(undefined)).toBe(false);
  });
});

// ─── canEditMessage ──────────────────────────────────────────────────────

describe('canEditMessage', () => {
  it('retourne true pour mon message texte récent', () => {
    const message = makeMessage({
      sender_id: MY_ID,
      type: 'text',
      created_at: minutesAgo(1),
    });

    expect(canEditMessage(message, MY_ID)).toBe(true);
  });

  it('retourne false si myId est null', () => {
    const message = makeMessage({ created_at: minutesAgo(1) });

    expect(canEditMessage(message, null)).toBe(false);
  });

  it('retourne false pour le message d\'un autre', () => {
    const message = makeMessage({
      sender_id: OTHER_ID,
      created_at: minutesAgo(1),
    });

    expect(canEditMessage(message, MY_ID)).toBe(false);
  });

  it('retourne false pour un message image', () => {
    const message = makeMessage({
      type: 'image',
      created_at: minutesAgo(1),
    });

    expect(canEditMessage(message, MY_ID)).toBe(false);
  });

  it('retourne false pour un message pending', () => {
    const message = makeMessage({
      status: 'pending',
      created_at: minutesAgo(1),
    });

    expect(canEditMessage(message, MY_ID)).toBe(false);
  });

  it('retourne false pour un message failed', () => {
    const message = makeMessage({
      status: 'failed',
      created_at: minutesAgo(1),
    });

    expect(canEditMessage(message, MY_ID)).toBe(false);
  });

  it('retourne false pour un message supprimé', () => {
    const message = makeMessage({
      deleted_at: new Date().toISOString(),
      created_at: minutesAgo(1),
    });

    expect(canEditMessage(message, MY_ID)).toBe(false);
  });

  it('retourne false si le délai de modification est dépassé', () => {
    // EDIT_WINDOW_MINUTES est importé depuis message.service.
    // On suppose une fenêtre de 15 minutes par défaut ; on met 60 min
    // pour être sûr de dépasser quelle que soit la valeur.
    const message = makeMessage({
      created_at: minutesAgo(60),
    });

    expect(canEditMessage(message, MY_ID)).toBe(false);
  });

  it('retourne true pour un message tout juste dans la fenêtre', () => {
    const message = makeMessage({
      created_at: secondsAgo(5),
    });

    expect(canEditMessage(message, MY_ID)).toBe(true);
  });
});

// ─── canActOnMessage ─────────────────────────────────────────────────────

describe('canActOnMessage', () => {
  it('retourne true pour mon message sent', () => {
    const message = makeMessage({
      sender_id: MY_ID,
      status: 'sent',
    });

    expect(canActOnMessage(message, MY_ID)).toBe(true);
  });

  it('retourne true pour mon message failed', () => {
    const message = makeMessage({
      sender_id: MY_ID,
      status: 'failed',
    });

    expect(canActOnMessage(message, MY_ID)).toBe(true);
  });

  it('retourne false pour mon message pending', () => {
    const message = makeMessage({
      sender_id: MY_ID,
      status: 'pending',
    });

    expect(canActOnMessage(message, MY_ID)).toBe(false);
  });

  it('retourne false pour le message d\'un autre', () => {
    const message = makeMessage({ sender_id: OTHER_ID });

    expect(canActOnMessage(message, MY_ID)).toBe(false);
  });

  it('retourne false pour un message supprimé', () => {
    const message = makeMessage({
      deleted_at: new Date().toISOString(),
    });

    expect(canActOnMessage(message, MY_ID)).toBe(false);
  });

  it('retourne false si myId est null', () => {
    expect(canActOnMessage(makeMessage(), null)).toBe(false);
  });
});

// ─── deliveryOf ──────────────────────────────────────────────────────────

describe('deliveryOf', () => {
  it('retourne "sent" si receipts est null', () => {
    const message = makeMessage({ created_at: minutesAgo(1) });

    expect(deliveryOf(message, null)).toBe('sent');
  });

  it('retourne "sent" si aucun receipt n\'est encore arrivé', () => {
    const message = makeMessage({ created_at: minutesAgo(1) });
    const receipts = makeReceipts();

    expect(deliveryOf(message, receipts)).toBe('sent');
  });

  it('retourne "delivered" si deliveredAt >= createdAt', () => {
    const message = makeMessage({ created_at: minutesAgo(10) });
    const receipts = makeReceipts({
      deliveredAt: Date.now() - 5 * 60 * 1000, // il y a 5 min
    });

    expect(deliveryOf(message, receipts)).toBe('delivered');
  });

  it('retourne "read" si readAt >= createdAt', () => {
    const message = makeMessage({ created_at: minutesAgo(10) });
    const receipts = makeReceipts({
      deliveredAt: Date.now() - 8 * 60 * 1000,
      readAt: Date.now() - 2 * 60 * 1000,
    });

    expect(deliveryOf(message, receipts)).toBe('read');
  });

  it('retourne "sent" si le receipt est antérieur au message', () => {
    const message = makeMessage({
      created_at: new Date().toISOString(),
    });
    const receipts = makeReceipts({
      deliveredAt: Date.now() - 10 * 60 * 1000,
      readAt: Date.now() - 10 * 60 * 1000,
    });

    expect(deliveryOf(message, receipts)).toBe('sent');
  });

  it('priorise "read" sur "delivered"', () => {
    const message = makeMessage({ created_at: minutesAgo(10) });
    const receipts = makeReceipts({
      deliveredAt: Date.now() - 5 * 60 * 1000,
      readAt: Date.now() - 2 * 60 * 1000,
    });

    expect(deliveryOf(message, receipts)).toBe('read');
  });
});

// ─── editErrorMessage ────────────────────────────────────────────────────

describe('editErrorMessage', () => {
  it('retourne un message explicite pour edit_window_expired', () => {
    const error = new Error('edit_window_expired');

    const result = editErrorMessage(error);

    expect(result).toContain('délai de modification');
    expect(result).toContain('minutes');
  });

  it('retourne un message explicite pour forbidden', () => {
    const error = new Error('forbidden');

    expect(editErrorMessage(error)).toBe(
      'Tu ne peux pas modifier ce message.'
    );
  });

  it('retourne un message explicite pour not_editable', () => {
    const error = new Error('not_editable');

    expect(editErrorMessage(error)).toBe(
      'Ce message ne peut plus être modifié.'
    );
  });

  it('retourne le message générique pour une erreur inconnue', () => {
    const error = new Error('something went wrong');

    expect(editErrorMessage(error)).toBe(
      'Impossible de modifier le message. Réessaie.'
    );
  });

  it('retourne le message générique pour une valeur non-Error', () => {
    expect(editErrorMessage('oops')).toBe(
      'Impossible de modifier le message. Réessaie.'
    );
    expect(editErrorMessage(null)).toBe(
      'Impossible de modifier le message. Réessaie.'
    );
  });
});