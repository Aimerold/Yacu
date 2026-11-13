import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '@/components/layout/AppHeader';
import { colors } from '@/theme/tokens';

const CATEGORIES = [
  'Tout',
  'Emplois',
  'Stages',
  'Freelance',
  'Bourses',
] as const;

type JobCategory = (typeof CATEGORIES)[number];

export default function JobsScreen() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] =
    useState<JobCategory>('Tout');

  return (
    <View style={styles.container}>
      <AppHeader />

      <View style={styles.body}>
        <Text style={styles.title}>Jobs</Text>

        <View style={styles.searchBar}>
          <Ionicons
            name="search-outline"
            size={21}
            color={colors.textMuted}
          />

          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher une opportunité…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Rechercher une opportunité"
          />

          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Effacer la recherche"
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          )}
        </View>

        <View style={styles.categoriesContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categories}
            keyboardShouldPersistTaps="handled"
          >
            {CATEGORIES.map((category) => {
              const selected = activeCategory === category;

              return (
                <Pressable
                  key={category}
                  style={[
                    styles.categoryButton,
                    selected && styles.categorySelected,
                  ]}
                  onPress={() => setActiveCategory(category)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      selected && styles.categoryTextSelected,
                    ]}
                  >
                    {category}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    paddingHorizontal: 22,
  },
  title: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 20,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  categoriesContainer: {
    marginTop: 18,
  },
  categories: {
    gap: 8,
    paddingBottom: 4,
  },
  categoryButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categorySelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  categoryText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  categoryTextSelected: {
    color: colors.onAccent,
  },
});