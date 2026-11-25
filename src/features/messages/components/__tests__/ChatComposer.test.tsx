// ─── Imports ─────────────────────────────────────────────────────────────

import {
    fireEvent,
    render,
} from '@testing-library/react-native';
import { Platform } from 'react-native';

// ─── Mocks (hoistés par Jest) ────────────────────────────────────────────

jest.mock('@/services/message.service', () => ({
  MESSAGE_MAX_LENGTH: 2000,
}));

// ─── Imports après mocks ─────────────────────────────────────────────────

import ChatComposer from '@/features/messages/components/ChatComposer';

// ─── Helpers ─────────────────────────────────────────────────────────────

const MIN_INPUT_HEIGHT = 44;

function noop() {}

type RenderOptions = {
  value?: string;
  inputHeight?: number;
  bottomPadding?: number;
  editing?: boolean;
  savingEdit?: boolean;
  canSend?: boolean;
  onChangeText?: (value: string) => void;
  onInputHeightChange?: (height: number) => void;
  onPickPhoto?: (source: 'library' | 'camera') => Promise<void>;
  onSubmit?: () => Promise<void>;
};

async function renderComposer(options: RenderOptions = {}) {
  const {
    value = '',
    inputHeight = MIN_INPUT_HEIGHT,
    bottomPadding = 0,
    editing = false,
    savingEdit = false,
    canSend = true,
    onChangeText = noop,
    onInputHeightChange = noop,
    onPickPhoto = noop as unknown as (source: 'library' | 'camera') => Promise<void>,
    onSubmit = noop as unknown as () => Promise<void>,
  } = options;

  return render(
    <ChatComposer
      value={value}
      inputHeight={inputHeight}
      bottomPadding={bottomPadding}
      editing={editing}
      savingEdit={savingEdit}
      canSend={canSend}
      onChangeText={onChangeText}
      onInputHeightChange={onInputHeightChange}
      onPickPhoto={onPickPhoto}
      onSubmit={onSubmit}
    />
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('ChatComposer — placeholder', () => {
  it('affiche "Écris un message..." en mode normal', async () => {
    const { getByPlaceholderText } = await renderComposer();

    expect(getByPlaceholderText('Écris un message...')).toBeTruthy();
  });

  it('affiche "Modifier le message..." en mode édition', async () => {
    const { getByPlaceholderText } = await renderComposer({
      editing: true,
    });

    expect(getByPlaceholderText('Modifier le message...')).toBeTruthy();
  });
});

describe('ChatComposer — bouton envoyer', () => {
  it('appelle onSubmit au clic quand canSend est true', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    const { getByLabelText } = await renderComposer({
      canSend: true,
      onSubmit,
    });

    fireEvent.press(getByLabelText('Envoyer le message'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('n\'appelle pas onSubmit quand canSend est false', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    const { getByLabelText } = await renderComposer({
      canSend: false,
      onSubmit,
    });

    fireEvent.press(getByLabelText('Envoyer le message'));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('affiche "Enregistrer la modification" en mode édition', async () => {
    const { getByLabelText } = await renderComposer({
      editing: true,
    });

    expect(
      getByLabelText('Enregistrer la modification')
    ).toBeTruthy();
  });
});

describe('ChatComposer — boutons photo', () => {
  it('appelle onPickPhoto("library") au clic sur le bouton image', async () => {
    const onPickPhoto = jest.fn().mockResolvedValue(undefined);

    const { getByLabelText } = await renderComposer({ onPickPhoto });

    fireEvent.press(getByLabelText('Choisir une photo'));

    expect(onPickPhoto).toHaveBeenCalledWith('library');
  });

  it('appelle onPickPhoto("camera") au clic sur le bouton caméra', async () => {
    const onPickPhoto = jest.fn().mockResolvedValue(undefined);

    const { getByLabelText } = await renderComposer({ onPickPhoto });

    fireEvent.press(getByLabelText('Prendre une photo'));

    expect(onPickPhoto).toHaveBeenCalledWith('camera');
  });

  it('masque les boutons photo en mode édition', async () => {
    const { queryByLabelText } = await renderComposer({
      editing: true,
    });

    expect(queryByLabelText('Choisir une photo')).toBeNull();
    expect(queryByLabelText('Prendre une photo')).toBeNull();
  });

  it('masque le bouton caméra sur web', async () => {
    // Force Platform.OS = 'web' pour ce test
    const originalOS = Platform.OS;
    (Platform as { OS: string }).OS = 'web';

    const { queryByLabelText } = await renderComposer();

    expect(queryByLabelText('Prendre une photo')).toBeNull();
    // Le bouton image reste disponible sur web
    expect(queryByLabelText('Choisir une photo')).toBeTruthy();

    // Restaure Platform.OS
    (Platform as { OS: string }).OS = originalOS;
  });
});

describe('ChatComposer — saisie', () => {
  it('appelle onChangeText quand l\'utilisateur tape', async () => {
    const onChangeText = jest.fn();

    const { getByPlaceholderText } = await renderComposer({
      onChangeText,
    });

    fireEvent.changeText(
      getByPlaceholderText('Écris un message...'),
      'Nouveau message'
    );

    expect(onChangeText).toHaveBeenCalledWith('Nouveau message');
  });

  it('affiche la valeur passée en prop', async () => {
    const { getByDisplayValue } = await renderComposer({
      value: 'Bonjour',
    });

    expect(getByDisplayValue('Bonjour')).toBeTruthy();
  });
});

describe('ChatComposer — savingEdit', () => {
  it('affiche un ActivityIndicator quand savingEdit est true', async () => {
    const { queryByLabelText, toJSON } = await renderComposer({
      savingEdit: true,
      editing: true,
    });

    // L'icône (checkmark/send) est remplacée par un ActivityIndicator.
    // On vérifie via le JSON que "ActivityIndicator" est présent.
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('ActivityIndicator');

    // Le bouton reste accessible
    expect(
      queryByLabelText('Enregistrer la modification')
    ).toBeTruthy();
  });
});

describe('ChatComposer — hauteur', () => {
  it('appelle onInputHeightChange quand le contenu change de taille', async () => {
    const onInputHeightChange = jest.fn();

    const { getByPlaceholderText } = await renderComposer({
      onInputHeightChange,
    });

    const input = getByPlaceholderText('Écris un message...');

    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { height: 60, width: 300 } },
    });

    // MIN_INPUT_HEIGHT = 44, INPUT_VERTICAL_PADDING = 20
    // 60 + 20 = 80, clampé entre 44 et 132 → 80
    expect(onInputHeightChange).toHaveBeenCalledWith(80);
  });

  it('clampe la hauteur à MAX_INPUT_HEIGHT (132)', async () => {
    const onInputHeightChange = jest.fn();

    const { getByPlaceholderText } = await renderComposer({
      onInputHeightChange,
    });

    const input = getByPlaceholderText('Écris un message...');

    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { height: 500, width: 300 } },
    });

    // 500 + 20 = 520, clampé à 132
    expect(onInputHeightChange).toHaveBeenCalledWith(132);
  });
});