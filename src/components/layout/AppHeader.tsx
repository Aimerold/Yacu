import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Avatar from '@/components/ui/Avatar';
import { useMyProfile } from '@/hooks/useMyProfile';
import { colors } from '@/theme/tokens';

/** En-tête commun aux onglets : nom de l'app à gauche, photo de profil à droite. */
export default function AppHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useMyProfile();

  const name = profile?.display_name || profile?.username || '';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.logo}>
        Yacu<Text style={styles.dot}>.</Text>
      </Text>

      <Pressable
        onPress={() => router.navigate('/(app)/(tabs)/settings')}
        accessibilityLabel="Ouvrir les paramètres"
        hitSlop={8}
      >
        <Avatar name={name} uri={profile?.avatar_url} size={40} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingBottom: 10,
    backgroundColor: colors.background,
  },
  logo: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  dot: {
    color: colors.accent,
  },
});