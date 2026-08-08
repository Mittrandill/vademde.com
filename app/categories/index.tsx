import { useMemo, useState } from 'react';
import { SectionList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Card, EmptyState, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { CategoryIcon } from '@/components/finance/CategoryIcon';
import { listCategories, type Category } from '@/features/categories/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { matchesSearch, normalizeForSearch } from '@/utils/search';

type KindFilterKey = 'all' | 'expense' | 'income';

const KIND_FILTERS: { key: KindFilterKey; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'expense', label: 'Gider' },
  { key: 'income', label: 'Gelir' },
];

export default function CategoriesScreen() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilterKey>('all');

  const categoriesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.categories(activeWorkspaceId) : ['categories', 'disabled'],
    queryFn: () => listCategories(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  const sections = useMemo(() => {
    const query = normalizeForSearch(search);
    const visible = categories.filter(
      (c) => (kindFilter === 'all' || c.kind === kindFilter) && matchesSearch(c.name, query)
    );
    return [
      { title: 'GİDER KATEGORİLERİ', data: visible.filter((c) => c.kind === 'expense') },
      { title: 'GELİR KATEGORİLERİ', data: visible.filter((c) => c.kind === 'income') },
    ].filter((section) => section.data.length > 0);
  }, [categories, search, kindFilter]);

  const isFiltered = search.trim().length > 0 || kindFilter !== 'all';

  // Tek dikey scroll sahibi: başlık, arama ve filtre SectionList'in ListHeaderComponent'ine
  // taşınır ki liste kaydırıldığında hepsi tek parça halinde birlikte kaysın — üstte sabit
  // kalıp listeyi küçük bir kutuya sıkıştırmasınlar. (Önceki halinde SectionList'e `flex: 1`
  // verilmemişti; bu da liste yerine doğal içerik yüksekliğine sıkışmasına yol açıyordu.)
  const listHeader = (
    <Stack gap="lg" style={{ paddingTop: theme.spacing.md, paddingBottom: theme.spacing.md }}>
      <Row align="center">
        <Pressable
          accessibilityLabel="Kapat"
          onPress={() => router.back()}
          hitSlop={8}
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radius.input,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.surfaceElevated,
          }}
        >
          <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
        </Pressable>
        <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
          Kategoriler
        </Text>
        <Pressable
          accessibilityLabel="Yeni kategori"
          onPress={() => router.push('/categories/new')}
          hitSlop={8}
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radius.input,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.brandPrimary,
          }}
        >
          <Ionicons name="add" size={26} color={theme.colors.brandPrimaryText} />
        </Pressable>
      </Row>

      <Stack gap="sm">
        <TextField
          placeholder="Kategori adında ara"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        <SegmentedControl options={KIND_FILTERS} value={kindFilter} onChange={setKindFilter} size="compact" stretch />
      </Stack>
    </Stack>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
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
          ListHeaderComponent={listHeader}
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
              <Card style={{ marginBottom: theme.spacing.sm }}>
                <Row gap="sm">
                  <CategoryIcon icon={item.icon} color={item.color} size={36} />
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
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={
            categoriesQuery.isSuccess ? (
              <Stack style={{ paddingTop: theme.spacing.lg }}>
                <EmptyState
                  icon="pricetag-outline"
                  title={categories.length === 0 ? 'Henüz kategori yok' : 'Sonuç bulunamadı'}
                  message={
                    categories.length === 0
                      ? 'Sağ üstteki + ile ilk kategorinizi ekleyin.'
                      : isFiltered
                        ? 'Arama terimini veya filtreyi değiştirin.'
                        : ' '
                  }
                />
              </Stack>
            ) : null
          }
        />
    </SafeAreaView>
  );
}
