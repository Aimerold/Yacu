import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

jest.mock('@/services/presence.service', () => ({
  getPresence: jest.fn(),
}));

import { useContactPresence } from '@/features/presence/hooks/useContactPresence';
import type { PresenceInfo } from '@/services/presence.service';
import { getPresence } from '@/services/presence.service';

const mockedGetPresence = getPresence as jest.MockedFunction<
  typeof getPresence
>;

const OTHER_ID = 'user-other';

function presenceMap(
  id: string,
  presence: PresenceInfo
): Map<string, PresenceInfo> {
  return new Map([[id, presence]]);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();

  mockedGetPresence.mockResolvedValue(
    presenceMap(OTHER_ID, {
      isOnline: true,
      lastSeenAt: '2026-01-01T00:00:00.000Z',
    })
  );
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useContactPresence — userId manquant', () => {
  it('ne fait pas de fetch si userId est undefined', async () => {
    const { result } = await renderHook(() =>
      useContactPresence(undefined)
    );

    expect(result.current).toBeNull();
    expect(mockedGetPresence).not.toHaveBeenCalled();
  });
});

describe('useContactPresence — chargement', () => {
  it('charge la présence au montage', async () => {
    const { result } = await renderHook(() =>
      useContactPresence(OTHER_ID)
    );

    await waitFor(() => {
      expect(result.current?.isOnline).toBe(true);
    });

    expect(mockedGetPresence).toHaveBeenCalledWith([OTHER_ID]);
  });

  it('reste null si l\'utilisateur n\'est pas dans le résultat', async () => {
    mockedGetPresence.mockResolvedValue(new Map());

    const { result } = await renderHook(() =>
      useContactPresence(OTHER_ID)
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current).toBeNull();
  });

  it('garde le dernier état connu en cas d\'erreur', async () => {
    const { result } = await renderHook(() =>
      useContactPresence(OTHER_ID)
    );

    await waitFor(() => {
      expect(result.current?.isOnline).toBe(true);
    });

    mockedGetPresence.mockRejectedValue(new Error('network down'));

    expect(result.current?.isOnline).toBe(true);
  });
});

describe('useContactPresence — changement de userId', () => {
  it('recharge quand userId change', async () => {
    const { result, rerender } = await renderHook(
      ({ id }: { id: string | undefined }) =>
        useContactPresence(id),
      { initialProps: { id: OTHER_ID } }
    );

    await waitFor(() => {
      expect(result.current?.isOnline).toBe(true);
    });

    const NEW_ID = 'user-new';

    mockedGetPresence.mockResolvedValue(
      presenceMap(NEW_ID, {
        isOnline: false,
        lastSeenAt: null,
      })
    );

    await rerender({ id: NEW_ID });

    await waitFor(() => {
      expect(result.current?.isOnline).toBe(false);
    });

    expect(mockedGetPresence).toHaveBeenCalledWith([NEW_ID]);
  });
});

describe('useContactPresence — polling', () => {
  it('recharge toutes les 20 s', async () => {
    jest.useFakeTimers();

    await renderHook(() =>
      useContactPresence(OTHER_ID)
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedGetPresence).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(20000);
      await Promise.resolve();
    });

    expect(mockedGetPresence).toHaveBeenCalledTimes(2);
  });
});

describe('useContactPresence — AppState', () => {
  it('recharge au retour au premier plan', async () => {
    const listeners: ((state: string) => void)[] = [];
    const removeMock = jest.fn();

    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(((_event: string, handler: (state: string) => void) => {
        listeners.push(handler);

        return {
          remove: removeMock,
        };
      }) as never);

    await renderHook(() =>
      useContactPresence(OTHER_ID)
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedGetPresence).toHaveBeenCalledTimes(1);

    await act(async () => {
      listeners.forEach((listener) => listener('active'));
      await Promise.resolve();
    });

    expect(mockedGetPresence).toHaveBeenCalledTimes(2);
  });
});

describe('useContactPresence — cleanup', () => {
  it('nettoie le timer et le listener au démontage', async () => {
    const removeMock = jest.fn();
    const clearIntervalSpy = jest.spyOn(globalThis, 'clearInterval');

    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((() => ({
        remove: removeMock,
      })) as never);

    const { unmount } = await renderHook(() =>
      useContactPresence(OTHER_ID)
    );

    await act(async () => {
      await Promise.resolve();
    });

    await unmount();

    expect(removeMock).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});