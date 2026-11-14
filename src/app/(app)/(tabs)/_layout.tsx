import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppPresence } from '@/features/presence/hooks/useAppPresence';
import { useFriendships } from '@/features/contacts/hooks/useFriendships';
import { usePushNotifications } from '@/features/notifications/hooks/usePushNotifications';
import { colors } from '@/theme/tokens';

export default function TabsLayout() {
  // Battement de cœur de présence + marquage « reçu », pour toute la zone connectée
  useAppPresence();
  // Enregistrement du jeton de notification + ouverture de la bonne conversation au toucher
  usePushNotifications();
  const { incomingCount } = useFriendships({ loadLists: false });

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.tabBorder,
        },
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarLabel: 'Chats',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
              size={size}
              color={color as string}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Contacts',
          tabBarLabel: 'Contacts',
          tabBarBadge: incomingCount > 0 ? incomingCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.accent,
            color: colors.onAccent,
          },
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'people' : 'people-outline'}
              size={size}
              color={color as string}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarLabel: 'Jobs',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'briefcase' : 'briefcase-outline'}
              size={size}
              color={color as string}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Paramètres',
          tabBarLabel: 'Paramètres',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'settings' : 'settings-outline'}
              size={size}
              color={color as string}
            />
          ),
        }}
      />

      {/* Ancien onglet Profil : masqué, il redirige vers Paramètres */}
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}