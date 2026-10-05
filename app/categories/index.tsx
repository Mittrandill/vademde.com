import { useMemo, useState } from 'react';
import { SectionList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { EmptyState, Pressable, ScrollableTabs, Stack, Text, TextField } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { CategoryIcon } from '@/components/finance/CategoryIcon';
import { listCategories, type Category } from '@/features/categories/api';
import { getCategoryBreakdown } from '@/features/reports/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { formatMinorAmount } from '@/utils/money';
import { matchesSearch, normalizeForSearch } from '@/utils/search';

type Kind = 'expense' | 'income';

const monthFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'long' });

// design Kategoriler.html: Gider/Gelir sekmeleri; bu ay en çok kullanılanlar üstte, kalanlar "Diğer"de.
// Kullanım tutarı raporlardaki mevcut kategori dökümünden (bu ay) gelir; yeni sorgu mantığı yoktur.
export default function CategoriesScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<Kind>('expense');

  const categoriesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.categories(activeWorkspaceId) : ['categories', 'disabled'],
    queryFn: () => listCategories(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  // Ay değişimi ekran yeniden açılınca yakalanır.
  const [monthRange] = useState(() => {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    };
  });
  const usageQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'category-usage', kind, monthRange.from] : ['category-usage', 'disabled'],
    queryFn: () => getCategoryBreakdown(activeWorkspaceId as string, kind, monthRange),
    enabled: !!activeWorkspaceId,
  });

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const usageById = useMemo(
    () => new Map((usageQuery.data ?? []).filter((u) => u.categoryId).map((u) => [u.categoryId as string, u.amountMinor])),
    [usageQuery.data]
  );
  const counts = useMemo(
    () => ({
      expense: categories.filter((c) => c.kind === 'expense').length,
      income: categories.filter((c) => c.kind === 'income').length,
    }),
    [categories]
  );

  const sections = useMemo(() => {
    const query = normalizeForSearch(search);
    const visible = categories
      .filter((c) => c.kind === kind && matchesSearch(c.name, query))
      .sort((a, b) => (usageById.get(b.id) ?? 0) - (usageById.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'tr'));
    const used = visible.filter((c) => (usageById.get(c.id) ?? 0) > 0);
    const top = used.slice(0, 4);
    const rest = visible.filter((c) => !top.includes(c));
    return [
      { title: `Bu ay en çok · ${monthFormatter.format(new Date())}`, data: top },
      { title: top.length > 0 ? 'Diğer' : 'Kategoriler', data: rest },
    ].filter((s) => s.data.length > 0);
  }, [categories, kind, search, usageById]);

  const listHeader = (
    <Stack gap="md" style={{ paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm }}>
      <ScreenHeader
        title="Kategoriler"
        left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: () => router.back() }}
        right={{ icon: 'add', accessibilityLabel: 'Yeni kategori', variant: 'accent', onPress: () => router.push('/categories/new') }}
      />
      <ScrollableTabs
        tabs={[
          { key: 'expense', label: `Gider · ${counts.expense}` },
          { key: 'income', label: `Gelir · ${counts.income}` },
        ]}
        activeKey={kind}
        onChange={(k) => setKind(k as Kind)}
      />
      <TextField
        placeholder="Kategori adında ara"
        value={search}
        onChangeText={setSearch}
        returnKeyType="search"
        autoCorrect={false}
      />
    </Stack>
  );

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <SectionList
        sections={sections}
        keyExtractor={(item: Category) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: theme.screenEdge.standard,
          paddingBottom: theme.spacing.xxl,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={listHeader}
        renderSectionHeader={({ section }) => (
          <Text variant="label" color="textSecondary" style={{ paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xxs }}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => {
          const used = usageById.get(item.id) ?? 0;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/categories/new', params: { id: item.id } })}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                minHeight: 60,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <CategoryIcon icon={item.icon} color={item.color} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="cardTitle" numberOfLines={1}>
                  {item.name}
                </Text>
                {used === 0 ? (
                  <Text variant="caption" color="textSecondary">
                    Bu ay yok
                  </Text>
                ) : null}
              </View>
              <Text variant="cardTitle" tabular color={used > 0 ? 'textPrimary' : 'textSecondary'}>
                {used > 0 ? formatMinorAmount(used).replace(/,00$/, '') : '—'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedControl} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          categoriesQuery.isSuccess ? (
            <Stack style={{ paddingTop: theme.spacing.lg }}>
              <EmptyState
                icon="pricetag-outline"
                title={categories.length === 0 ? 'Henüz kategori yok' : 'Sonuç bulunamadı'}
                message={
                  categories.length === 0
                    ? 'Sağ üstteki + ile ilk kategorinizi ekleyin.'
                    : 'Arama terimini veya sekmeyi değiştirin.'
                }
              />
            </Stack>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
