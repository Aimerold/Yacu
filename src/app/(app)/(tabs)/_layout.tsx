import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FF8A32',
        tabBarInactiveTintColor: '#A8B6C8',
        tabBarStyle: {
          backgroundColor: '#10223A',
          borderTopColor: '#263C57',
        },
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{ title: 'Chats', tabBarLabel: 'Chats' }}
      />

      <Tabs.Screen
        name="contacts"
        options={{ title: 'Contacts', tabBarLabel: 'Contacts' }}
      />

      <Tabs.Screen
        name="profile"
        options={{ title: 'Profil', tabBarLabel: 'Profil' }}
      />
    </Tabs>
  );
}