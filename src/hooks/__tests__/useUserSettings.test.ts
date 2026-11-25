// ─── Imports ─────────────────────────────────────────────────────────────

import { act, renderHook, waitFor } from '@testing-library/react-native';

// ─── Mocks (hoistés par Jest) ────────────────────────────────────────────

jest.mock('@/services/conversation.service', () => ({
  getCurrentUserId: jest.fn(),
}));

jest.mock('@/services/user-settings.service', () => ({
  ensureUserSettings: jest.fn(),
  updateUserSettings: jest.fn(),
}));

// ─── Imports après mocks ─────────────────────────────────────────────────

import { useUserSettings } from '@/hooks/useUserSettings';
import { getCurrentUserId } from '@/services/conversation.service';
import type { UserSettings } from '@/services/user-settings.service';
import {
  ensureUserSettings,
  updateUserSettings,
} from '@/services/user-settings.service';

// ─── Helpers ─────────────────────────────────────────────────────────────

const mockedGetCurrentUserId = getCurrentUserId as jest.MockedFunction<
  typeof getCurrentUserId
>;
const mockedEnsureUserSettings = ensureUserSettings as jest.MockedFunction<
  typeof ensureUserSettings
>;
const mockedUpdateUserSettings = updateUserSettings as jest.MockedFunction<
  typeof updateUserSettings
>;

const USER_ID = 'user-me';

/** Date figée pour rendre les tests déterministes. */
const FIXED_DATE = '2026-01-01T00:00:00.000Z';

function makeSettings(
  overrides: Partial<UserSettings> = {}
): UserSettings {
  return {
    user_id: USER_ID,
    show_last_seen: true,
    show_online_status: true,
    typing_indicator_enabled: true,
    read_receipts_enabled: true,
    push_notifications_enabled: true,
    theme_preference: 'system',
    updated_at: FIXED_DATE,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetCurrentUserId.mockResolvedValue(USER_ID);
  mockedEnsureUserSettings.mockResolvedValue(makeSettings());
  mockedUpdateUserSettings.mockImplementation(
    async (_userId, patch) => makeSettings(patch)
  );
});

// ─── Tests ───────────────────────────────────────────────────────────────

describe('useUserSettings — chargement initial', () => {
  it('commence avec loading=true et settings=null', async () => {
    mockedEnsureUserSettings.mockReturnValue(new Promise(() => {}));

    const { result } = await renderHook(() => useUserSettings());

    expect(result.current.loading).toBe(true);
    expect(result.current.settings).toBeNull();
  });

  it('charge les settings au montage', async () => {
    const { result } = await renderHook(() => useUserSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.settings).toEqual(makeSettings());
    expect(result.current.error).toBe('');
  });

  it('remplit error si ensureUserSettings échoue', async () => {
    mockedEnsureUserSettings.mockRejectedValue(
      new Error('network down')
    );

    const { result } = await renderHook(() => useUserSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.settings).toBeNull();
    expect(result.current.error).toBe(
      'Impossible de charger tes réglages.'
    );
  });

  it('remplit error si getCurrentUserId échoue', async () => {
    mockedGetCurrentUserId.mockRejectedValue(
      new Error('session invalide')
    );

    const { result } = await renderHook(() => useUserSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(
      'Impossible de charger tes réglages.'
    );
  });
});

describe('useUserSettings — reload', () => {
  it('recharge les settings quand on appelle reload()', async () => {
    const { result } = await renderHook(() => useUserSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockedEnsureUserSettings.mockResolvedValue(
      makeSettings({ theme_preference: 'dark' })
    );

    await act(async () => {
      await result.current.reload();
    });

    await waitFor(() => {
      expect(result.current.settings?.theme_preference).toBe('dark');
    });
  });
});

describe('useUserSettings — update', () => {
  it('applique le patch immédiatement (optimiste)', async () => {
    const { result } = await renderHook(() => useUserSettings());

    await waitFor(() => {
      expect(result.current.settings).not.toBeNull();
    });

    await act(async () => {
      await result.current.update({ theme_preference: 'dark' });
    });

    expect(result.current.settings?.theme_preference).toBe('dark');
    expect(mockedUpdateUserSettings).toHaveBeenCalledWith(
      USER_ID,
      { theme_preference: 'dark' }
    );
  });

  it('rollback en cas d\'échec de l\'enregistrement', async () => {
    const { result } = await renderHook(() => useUserSettings());

    await waitFor(() => {
      expect(result.current.settings).not.toBeNull();
    });

    mockedUpdateUserSettings.mockRejectedValue(
      new Error('network down')
    );

    await act(async () => {
      await result.current.update({ theme_preference: 'dark' });
    });

    expect(result.current.settings?.theme_preference).toBe('system');
    expect(result.current.error).toBe(
      'Impossible d’enregistrer ce réglage. Vérifie ta connexion.'
    );
  });

  it('ne fait rien si les settings ne sont pas encore chargés', async () => {
    mockedEnsureUserSettings.mockReturnValue(new Promise(() => {}));

    const { result } = await renderHook(() => useUserSettings());

    await act(async () => {
      await result.current.update({ theme_preference: 'dark' });
    });

    expect(mockedUpdateUserSettings).not.toHaveBeenCalled();
  });
});