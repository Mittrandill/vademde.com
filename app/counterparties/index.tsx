import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { withAlpha } from '@/theme/colors';
import {
  Card,
  Divider,
  Pagination,
  Pressable,
  Row,
  Skeleton,
  Stack,
  Text,
  TextField,
} from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import {
  getCounterpartyBalances,
  listCounterparties,
  type Counterparty,
} from '@/features/counterparties/api';
import { PersonAvatar } from '@/components/finance/PersonAvatar';
import { FinanceFilterCard } from '@/components/finance/FinanceFilterCard';
import { matchesSearch, normalizeForSearch } from '@/utils/search';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { formatMinorAmount } from '@/utils/money';

const PAGE_SIZE = 10;

type TypeFilterKey = 'all' | 'individual' | 'company';

const TYPE_FILTERS: { key: TypeFilterKey; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'individual', label: 'Kişiler' },
  { key: 'company', label: 'Firmalar' },
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
      if (typeFilter !== 'all' && counterparty.type !== typeFilter) return false;
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
    let individualCount = 0;
    let companyCount = 0;

    for (const counterparty of counterparties) {
      const net = balances?.[counterparty.id] ?? 0;
      if (net > 0) receivableMinor += net;
      if (net < 0) payableMinor += -net;
      if (counterparty.type === 'company') companyCount += 1;
      else individualCount += 1;
    }

    return {
      receivableMinor,
      payableMinor,
      netMinor: receivableMinor - payableMinor,
      individualCount,
      companyCount,
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
            title="Kişi / Firmalar"
            left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: () => router.back() }}
            right={{
              icon: 'add',
              accessibilityLabel: 'Yeni cari ekle',
              variant: 'accent',
              onPress: openNewCounterparty,
            }}
          />

          <CounterpartyHero
            totalCount={counterparties.length}
            individualCount={totals.individualCount}
            companyCount={totals.companyCount}
            receivableMinor={totals.receivableMinor}
            payableMinor={totals.payableMinor}
            netMinor={totals.netMinor}
          />

          <FinanceFilterCard
            title="CARİ TÜRÜ"
            description="Listede görmek istediğiniz kişi veya firma türünü seçin."
            options={TYPE_FILTERS}
            value={typeFilter}
            onChange={setTypeFilter}
          />

          <Card
            variant="hero"
            style={{
              padding: 0,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ padding: theme.spacing.lg }}>
              <View style={{ position: 'relative', justifyContent: 'center' }}>
                <Ionicons
                  name="search-outline"
                  size={22}
                  color={theme.colors.textSecondary}
                  style={{ position: 'absolute', left: theme.spacing.md, zIndex: 1 }}
                />
                <TextField
                  accessibilityLabel="Cari ara"
                  placeholder="İsim, e-posta veya telefon ara"
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                  autoCorrect={false}
                  style={{ paddingLeft: theme.spacing.huge, backgroundColor: theme.colors.backgroundPrimary }}
                />
              </View>
            </View>

            <Divider />

            {!counterpartiesQuery.isSuccess ? (
              <Stack gap="sm" style={{ padding: theme.spacing.lg }}>
                <Skeleton height={72} borderRadius={theme.radius.input} />
                <Skeleton height={72} borderRadius={theme.radius.input} />
                <Skeleton height={72} borderRadius={theme.radius.input} />
              </Stack>
            ) : pagedCounterparties.length > 0 ? (
              pagedCounterparties.map((counterparty, index) => (
                <View key={counterparty.id}>
                  {index > 0 ? <Divider /> : null}
                  <CounterpartyRow counterparty={counterparty} netMinor={balances?.[counterparty.id] ?? 0} />
                </View>
              ))
            ) : (
              <EmptyCounterparties hasAny={counterparties.length > 0} onAdd={openNewCounterparty} />
            )}

            {counterpartiesQuery.error ? (
              <Text variant="body" color="danger" style={{ padding: theme.spacing.lg }}>
                {counterpartiesQuery.error instanceof Error
                  ? counterpartiesQuery.error.message
                  : 'Cariler yüklenemedi'}
              </Text>
            ) : null}

            {counterpartiesQuery.isSuccess && pagedCounterparties.length > 0 ? (
              <>
                <Divider />
                <Row
                  gap="sm"
                  style={{
                    minHeight: 68,
                    justifyContent: 'space-between',
                    paddingHorizontal: theme.spacing.lg,
                  }}
                >
                  <Text variant="body" color="textSecondary" tabular>
                    {visibleRangeLabel}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Yeni cari ekle"
                    onPress={openNewCounterparty}
                    style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
                  >
                    <Ionicons name="add" size={20} color={theme.colors.brandPrimary} />
                    <Text variant="body" color="brandPrimary" style={{ fontWeight: '600' }}>
                      Yeni cari
                    </Text>
                  </Pressable>
                </Row>
                {totalPages > 1 ? (
                  <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
                    <Pagination page={effectivePage} totalPages={totalPages} onChange={setPage} />
                  </View>
                ) : null}
              </>
            ) : null}
          </Card>
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}

interface CounterpartyHeroProps {
  totalCount: number;
  individualCount: number;
  companyCount: number;
  receivableMinor: number;
  payableMinor: number;
  netMinor: number;
}

function CounterpartyHero({
  totalCount,
  individualCount,
  companyCount,
  receivableMinor,
  payableMinor,
  netMinor,
}: CounterpartyHeroProps) {
  const theme = useTheme();
  const netColor = netMinor > 0 ? theme.colors.success : netMinor < 0 ? theme.colors.danger : theme.colors.textPrimary;
  const netPrefix = netMinor > 0 ? '+' : netMinor < 0 ? '-' : '';

  return (
    <Card variant="hero" style={{ paddingBottom: 0, overflow: 'hidden' }}>
      {/* Sağ üstte yoğunlaşıp kartın üst yarısına yayılan eliptik safran ışıma. Düz renkli
          daireler yüzeyde kaybolduğu için gerçek radial geçiş kullanılır. */}
      <Svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        }}
      >
        <Defs>
          <RadialGradient
            id="counterpartyHeroGlow"
            gradientUnits="userSpaceOnUse"
            cx={1000}
            cy={0}
            fx={1000}
            fy={0}
            rx={880}
            ry={600}
          >
            <Stop
              offset="0%"
              stopColor={theme.colors.brandPrimary}
              stopOpacity={theme.scheme === 'dark' ? 0.18 : 0.126}
            />
            <Stop
              offset="34%"
              stopColor={theme.colors.brandPrimary}
              stopOpacity={theme.scheme === 'dark' ? 0.099 : 0.0675}
            />
            <Stop
              offset="70%"
              stopColor={theme.colors.brandPrimary}
              stopOpacity={theme.scheme === 'dark' ? 0.0315 : 0.0225}
            />
            <Stop offset="100%" stopColor={theme.colors.brandPrimary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#counterpartyHeroGlow)" />
      </Svg>

      <Stack gap="xl" style={{ zIndex: 1 }}>
        <Stack gap="xs">
          <Text
            variant="cardTitle"
            color="textSecondary"
            style={{ letterSpacing: 1.8, fontSize: 14 }}
          >
            NET CARİ DURUM
          </Text>
          <Text variant="body" color="textSecondary">
            Alacaklarınızdan borçlarınız çıkarılarak hesaplanır
          </Text>
        </Stack>

        <Text
          variant="displayBalance"
          tabular
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.62}
          style={{ color: netColor }}
        >
          {netPrefix}
          {formatMinorAmount(Math.abs(netMinor))}
        </Text>

        <View
          style={{
            marginHorizontal: -theme.spacing.lg,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            flexDirection: 'row',
            flexWrap: 'wrap',
          }}
        >
          <HeroMetric label="TOPLAM CARİ" value={String(totalCount)} caption="Tüm kayıtlar" bottom right />
          <HeroMetric
            label="ALACAĞINIZ"
            value={formatMinorAmount(receivableMinor)}
            caption="Tahsil edilecek"
            valueColor="success"
            bottom
          />
          <HeroMetric
            label="BORCUNUZ"
            value={formatMinorAmount(payableMinor)}
            caption="Ödenecek"
            valueColor="danger"
            right
          />
          <HeroMetric label="KİŞİ / FİRMA" value={`${individualCount} / ${companyCount}`} caption="Cari dağılımı" />
        </View>
      </Stack>
    </Card>
  );
}

interface HeroMetricProps {
  label: string;
  value: string;
  caption: string;
  valueColor?: 'success' | 'danger';
  right?: boolean;
  bottom?: boolean;
}

function HeroMetric({ label, value, caption, valueColor, right, bottom }: HeroMetricProps) {
  const theme = useTheme();

  return (
    <Stack
      gap="xs"
      style={{
        width: '50%',
        minHeight: 118,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        borderRightWidth: right ? 1 : 0,
        borderRightColor: theme.colors.border,
        borderBottomWidth: bottom ? 1 : 0,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Text variant="caption" color="textSecondary" style={{ letterSpacing: 1.2, fontWeight: '600' }}>
        {label}
      </Text>
      <Text
        variant="cardTitle"
        color={valueColor}
        tabular
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.68}
      >
        {value}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {caption}
      </Text>
    </Stack>
  );
}

function CounterpartyRow({ counterparty, netMinor }: { counterparty: Counterparty; netMinor: number }) {
  const theme = useTheme();
  const isCompany = counterparty.type === 'company';
  const detail = counterparty.phone || counterparty.email || 'Bilgi eklenmedi';
  const amountPrefix = netMinor > 0 ? '+' : netMinor < 0 ? '-' : '';
  const amountColor = netMinor > 0 ? theme.colors.success : netMinor < 0 ? theme.colors.danger : theme.colors.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${counterparty.name} cari detayını aç`}
      onPress={() => router.push(`/counterparties/${counterparty.id}`)}
      style={{
        minHeight: 86,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
      }}
    >
      <PersonAvatar name={counterparty.name} size={48} />

      <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
        <Text variant="cardTitle" numberOfLines={1}>
          {counterparty.name}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {isCompany ? 'Firma' : 'Kişi'} · {detail}
        </Text>
      </Stack>

      <Text
        variant="cardTitle"
        tabular
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.68}
        style={{ maxWidth: '34%', color: amountColor }}
      >
        {netMinor === 0 ? '—' : `${amountPrefix}${formatMinorAmount(Math.abs(netMinor))}`}
      </Text>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
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
        <Ionicons name="people-outline" size={24} color={theme.colors.brandPrimary} />
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
          <Ionicons name="add" size={20} color={theme.colors.brandPrimary} />
          <Text variant="body" color="brandPrimary" style={{ fontWeight: '600' }}>
            Yeni cari ekle
          </Text>
        </Pressable>
      ) : null}
    </Stack>
  );
}
