import { useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { EmptyState, GroupedRow, GroupedSection, SegmentedControl, Stack, TextField } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { CategoryIcon } from '@/components/finance/CategoryIcon';
import { listCategories } from '@/features/categories/api';
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

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.screenEdge.standard,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Stack gap="md">
          <ScreenHeader
            title="Kategoriler"
            left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: () => router.back() }}
            right={{ icon: 'add', accessibilityLabel: 'Yeni kategori', variant: 'accent', onPress: () => router.push('/categories/new') }}
          />
          <SegmentedControl
            options={[
              { key: 'income', label: `Gelir · ${counts.income}` },
              { key: 'expense', label: `Gider · ${counts.expense}` },
            ]}
            value={kind}
            onChange={setKind}
          />
          <TextField
            placeholder="Kategori ara"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
          />

          {sections.map((section) => (
            <GroupedSection key={section.title} title={section.title}>
              {section.data.map((item) => {
                const used = usageById.get(item.id) ?? 0;
                return (
                  <GroupedRow
                    key={item.id}
                    leading={<CategoryIcon icon={item.icon} color={item.color} size={34} />}
                    title={item.name}
                    subtitle={used === 0 ? 'Bu ay yok' : undefined}
                    value={used > 0 ? formatMinorAmount(used).replace(/,00$/, '') : '—'}
                    onPress={() => router.push({ pathname: '/categories/new', params: { id: item.id } })}
                  />
                );
              })}
            </GroupedSection>
          ))}

          {sections.length === 0 && categoriesQuery.isSuccess ? (
            <EmptyState
              icon="pricetag-outline"
              title={categories.length === 0 ? 'Henüz kategori yok' : 'Sonuç bulunamadı'}
              message={
                categories.length === 0
                  ? 'Sağ üstteki + ile ilk kategorinizi ekleyin.'
                  : 'Arama terimini veya sekmeyi değiştirin.'
              }
            />
          ) : null}
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}
