import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { withAlpha } from '@/theme/colors';
import { Divider, Pressable, Skeleton, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import {
  COUNTERPARTY_TYPES,
  COUNTERPARTY_TYPE_LABEL_PLURAL,
  getCounterpartyBalances,
  getCounterpartyType,
  getCounterpartyTypeLabel,
  listCounterparties,
  type Counterparty,
  type CounterpartyType,
} from '@/features/counterparties/api';
import { PersonAvatar } from '@/components/finance/PersonAvatar';
import { FinanceFilterCard } from '@/components/finance/FinanceFilterCard';
import { FinanceListHero } from '@/components/finance/FinanceListHero';
import { FinanceListSurface } from '@/components/finance/FinanceListSurface';
import { matchesSearch, normalizeForSearch } from '@/utils/search';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { formatMinorAmount } from '@/utils/money';
import { friendlyErrorMessage } from '@/utils/alerts';

const PAGE_SIZE = 10;

type TypeFilterKey = 'all' | CounterpartyType;

const TYPE_FILTERS: { key: TypeFilterKey; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  ...COUNTERPARTY_TYPES.map((key) => ({ key, label: COUNTERPARTY_TYPE_LABEL_PLURAL[key] })),
];

export default function CounterpartiesScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilterKey>('all');
  const [page, setPage] = useState(0);

  const counterpartiesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.counterparties(activeWorkspaceId) : ['counterparties', 'disabled'],
    queryFn: () => listCounterparties(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'counterparties', 'balances'] : ['balances', 'disabled'],
    queryFn: () => getCounterpartyBalances(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const counterparties = useMemo(() => counterpartiesQuery.data ?? [], [counterpartiesQuery.data]);
  const balances = balancesQuery.data;

  const filtered = useMemo(() => {
    const query = normalizeForSearch(search);
    return counterparties.filter((counterparty) => {
      if (typeFilter !== 'all' && getCounterpartyType(counterparty.type) !== typeFilter) return false;
      return (
        matchesSearch(counterparty.name, query) ||
        matchesSearch(counterparty.phone, query) ||
        matchesSearch(counterparty.email, query)
      );
    });
  }, [counterparties, search, typeFilter]);

  const resetKey = `${search}|${typeFilter}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages - 1);
  const pageStart = effectivePage * PAGE_SIZE;
  const pagedCounterparties = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const totals = useMemo(() => {
    let receivableMinor = 0;
    let payableMinor = 0;
    // Tür sayacı COUNTERPARTY_TYPES üzerinden kurulur; yeni bir tür eklendiğinde
    // "diğer her şey kişidir" varsayımıyla yanlış kovaya düşmez.
    const typeCounts: Record<CounterpartyType, number> = { individual: 0, company: 0, personel: 0 };

    for (const counterparty of counterparties) {
      const net = balances?.[counterparty.id] ?? 0;
      if (net > 0) receivableMinor += net;
      if (net < 0) payableMinor += -net;
      typeCounts[getCounterpartyType(counterparty.type)] += 1;
    }

    return {
      receivableMinor,
      payableMinor,
      netMinor: receivableMinor - payableMinor,
      typeCounts,
    };
  }, [counterparties, balances]);

  function openNewCounterparty() {
    router.push('/counterparties/new');
  }

  const visibleRangeLabel =
    filtered.length > PAGE_SIZE
      ? `${pageStart + 1}–${pageStart + pagedCounterparties.length} / ${filtered.length} cari`
      : `${pagedCounterparties.length} / ${filtered.length} cari gösteriliyor`;

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
        <Stack gap="lg">
          <ScreenHeader
            title="Cariler"
            left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: () => router.back() }}
            right={{
              icon: 'add',
              accessibilityLabel: 'Yeni cari ekle',
              variant: 'accent',
              onPress: openNewCounterparty,
            }}
          />

          <FinanceListHero
            label="NET CARİ DURUM"
            description="Alacaklarınızdan borçlarınız çıkarılarak hesaplanır"
            amountText={`${totals.netMinor > 0 ? '+' : totals.netMinor < 0 ? '−' : ''}${formatMinorAmount(Math.abs(totals.netMinor))}`}
            amountColor={totals.netMinor > 0 ? 'receivable' : 'textPrimary'}
            metrics={[
              { label: 'TOPLAM CARİ', value: String(counterparties.length), caption: 'Tüm kayıtlar' },
              { label: 'ALACAĞINIZ', value: formatMinorAmount(totals.receivableMinor), caption: 'Tahsil edilecek', valueColor: 'receivable' },
              { label: 'BORCUNUZ', value: formatMinorAmount(totals.payableMinor), caption: 'Ödenecek', valueColor: 'payable' },
            ]}
          />

          <FinanceFilterCard
            title="CARİ TÜRÜ"
            description="Listede görmek istediğiniz cari türünü seçin."
            options={TYPE_FILTERS}
            value={typeFilter}
            onChange={setTypeFilter}
          />

          <FinanceListSurface
            searchPlaceholder="İsim, e-posta veya telefon"
            searchValue={search}
            onSearchChange={setSearch}
            footerLabel={pagedCounterparties.length > 0 ? visibleRangeLabel : undefined}
            actionLabel={pagedCounterparties.length > 0 ? 'Yeni cari' : undefined}
            onActionPress={openNewCounterparty}
            page={effectivePage}
            totalPages={totalPages}
            onPageChange={setPage}
          >
            {!counterpartiesQuery.isSuccess ? (
              <Stack gap="sm" style={{ padding: theme.spacing.lg }}>
                <Skeleton height={60} borderRadius={theme.radius.input} />
                <Skeleton height={60} borderRadius={theme.radius.input} />
                <Skeleton height={60} borderRadius={theme.radius.input} />
              </Stack>
            ) : pagedCounterparties.length > 0 ? (
              pagedCounterparties.map((counterparty, index) => (
                <View key={counterparty.id}>
                  {index > 0 ? <Divider style={{ marginLeft: 62 }} /> : null}
                  <CounterpartyRow counterparty={counterparty} netMinor={balances?.[counterparty.id] ?? 0} />
                </View>
              ))
            ) : (
              <EmptyCounterparties hasAny={counterparties.length > 0} onAdd={openNewCounterparty} />
            )}
            {counterpartiesQuery.error ? (
              <Text color="danger" style={{ padding: theme.spacing.lg }}>
                {friendlyErrorMessage(counterpartiesQuery.error, 'Cariler yüklenemedi')}
              </Text>
            ) : null}
          </FinanceListSurface>
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}

function CounterpartyRow({ counterparty, netMinor }: { counterparty: Counterparty; netMinor: number }) {
  const theme = useTheme();
  const detail = counterparty.phone || counterparty.email || 'Bilgi eklenmedi';
  const amountPrefix = netMinor > 0 ? '+' : netMinor < 0 ? '−' : '';
  const amountColor = netMinor > 0 ? theme.colors.receivable : netMinor < 0 ? theme.colors.textPrimary : theme.colors.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${counterparty.name} cari detayını aç`}
      onPress={() => router.push(`/counterparties/${counterparty.id}`)}
      style={{ minHeight: 60, paddingHorizontal: theme.spacing.md, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <PersonAvatar name={counterparty.name} size={34} />

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontWeight: '500' }}>
          {counterparty.name}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {getCounterpartyTypeLabel(counterparty.type)} · {detail}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 2, maxWidth: '38%' }}>
        <Text tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} style={{ fontWeight: '600', color: amountColor }}>
          {netMinor === 0 ? '₺0,00' : `${amountPrefix}${formatMinorAmount(Math.abs(netMinor))}`}
        </Text>
        <Text variant="caption" color="textSecondary">
          {netMinor > 0 ? 'Alacaklısınız' : netMinor < 0 ? 'Borçlusunuz' : 'Kapalı'}
        </Text>
      </View>
    </Pressable>
  );
}

function EmptyCounterparties({ hasAny, onAdd }: { hasAny: boolean; onAdd: () => void }) {
  const theme = useTheme();

  return (
    <Stack align="center" gap="sm" style={{ paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.xxxl }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: theme.radius.input,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withAlpha(theme.colors.brandPrimary, 0.14),
        }}
      >
        <Ionicons name="people-outline" size={24} color={theme.colors.textPrimary} />
      </View>
      <Text variant="cardTitle">{hasAny ? 'Sonuç bulunamadı' : 'Henüz cari yok'}</Text>
      <Text variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
        {hasAny ? 'Arama terimini veya cari türünü değiştirin.' : 'İlk kişi veya firmanızı ekleyerek başlayın.'}
      </Text>
      {!hasAny ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Yeni cari ekle"
          onPress={onAdd}
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
        >
          <Ionicons name="add" size={20} color={theme.colors.textPrimary} />
          <Text variant="body" color="textPrimary" style={{ fontWeight: '600' }}>
            Yeni cari ekle
          </Text>
        </Pressable>
      ) : null}
    </Stack>
  );
}
