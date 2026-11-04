import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function Index() {
  const [session, setSession] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        setSession(false);
        return;
      }

      setSession(!!data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        if (mounted) setSession(!!currentSession);
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (session === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#081426', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FF8A32" />
      </View>
    );
  }

  return session ? (
    <Redirect href="/(app)/(tabs)/chats" />
  ) : (
    <Redirect href="/(auth)/login" />
  );
}