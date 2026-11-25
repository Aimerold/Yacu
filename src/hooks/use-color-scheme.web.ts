import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

function subscribe() {
  return () => {};
}

function getClientSnapshot() {
  return typeof window !== 'undefined';
}

function getServerSnapshot() {
  return false;
}

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  );
  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : 'light';
}
