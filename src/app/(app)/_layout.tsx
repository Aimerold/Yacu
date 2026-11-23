import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import IncomingCallModal from '@/features/calls/components/IncomingCallModal';
import { useIncomingCalls } from '@/features/calls/hooks/useIncomingCalls';
import { registerPushToken } from '@/services/push.service';
import { configurePushNotifications } from '@/services/push.service';



export default function AppLayout() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  const { incomingCall, clearIncomingCall } = useIncomingCalls();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      const hasSession = !error && !!data.session;

      setAuthenticated(hasSession);

      if (hasSession) {
        void registerPushToken();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;

        setAuthenticated(!!session);

        if (session) {
          void registerPushToken();
        }
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);


  useEffect(() => {
    const subscription = configurePushNotifications();

    return () => {
      subscription.remove();
    };
  }, []);

  if (authenticated === null) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#081426',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color="#FF8A32" />
      </View>
    );
  }

  if (!authenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />

      <IncomingCallModal
        call={incomingCall}
        onClose={clearIncomingCall}
      />
    </>
  );
}