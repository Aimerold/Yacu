import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** Indique si le clavier virtuel est affiché (toujours false sur le Web). */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, () =>
      setVisible(true)
    );
    const hideSubscription = Keyboard.addListener(hideEvent, () =>
      setVisible(false)
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return visible;
}