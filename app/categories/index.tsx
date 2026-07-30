import { SectionList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Pressable, Row, Stack, Text } from '@/components/primitives';
import { listCategories, type Category } from '@/features/categories/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';

const FALLBACK_ICON: keyof typeof Ionicons.glyphMap = 'pricetag-outline';

export default function CategoriesScreen() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const categoriesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.categories(activeWorkspaceId) : ['categories', 'disabled'],
    queryFn: () => listCategories(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const categories = categoriesQuery.data ?? [];
  const sections = [
    { title: 'GİDER KATEGORİLERİ', data: categories.filter((c) => c.kind === 'expense') },
    { title: 'GELİR KATEGORİLERİ', data: categories.filter((c) => c.kind === 'income') },
  ].filter((section) => section.data.length > 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Stack gap="lg" style={{ flex: 1, paddingTop: theme.spacing.md }}>
        <Row style={{ paddingHorizontal: theme.screenEdge.standard }} align="center">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
          </Pressable>
          <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
            Kategoriler
          </Text>
          <Pressable onPress={() => router.push('/categories/new')} hitSlop={12}>
            <Ionicons name="add-circle" size={30} color={theme.colors.brandPrimary} />
          </Pressable>
        </Row>

        <SectionList
          sections={sections}
          keyExtractor={(item: Category) => item.id}
          contentContainerStyle={{
            paddingHorizontal: theme.screenEdge.standard,
            paddingBottom: theme.spacing.xxl,
          }}
          renderSectionHeader={({ section }) => (
            <Text
              variant="caption"
              color="textSecondary"
              style={{ backgroundColor: theme.colors.backgroundPrimary, paddingVertical: theme.spacing.sm }}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push({ pathname: '/categories/new', params: { id: item.id } })}>
              <Row
                gap="sm"
                style={{
                  backgroundColor: theme.colors.surfacePrimary,
                  borderRadius: theme.radius.widget,
                  padding: theme.spacing.md,
                  marginBottom: theme.spacing.sm,
                }}
              >
                <Ionicons
                  name={(item.icon as keyof typeof Ionicons.glyphMap) || FALLBACK_ICON}
                  size={20}
                  color={theme.colors.textSecondary}
                />
                <Text variant="body" style={{ flex: 1 }}>
                  {item.name}
                </Text>
                {item.is_default ? (
                  <Text variant="caption" color="textSecondary">
                    Varsayılan
                  </Text>
                ) : null}
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
              </Row>
            </Pressable>
          )}
          ListEmptyComponent={
            categoriesQuery.isSuccess ? (
              <Text variant="body" color="textSecondary">
                Henüz kategori yok.
              </Text>
            ) : null
          }
        />
      </Stack>
    </SafeAreaView>
  );
}
