import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Card, EmptyState, Group, Pressable, ScrollableTabs, SegmentedControl, Skeleton, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { HeroAmount } from '@/components/finance/HeroAmount';
import { BankLogo } from '@/components/finance/BankLogo';
import { INSTRUMENT_STATUS_LABEL, instrumentPortfolioRows, instrumentPortfolioTotal, instrumentStatusOf, listInstruments, type InstrumentStatus } from '@/features/instruments/api';
import { listValueUnitRates } from '@/features/valueUnits/api';
import { queryKeys } from '@/services/queryKeys';
import type { ObligationWithRelations } from '@/features/obligations/api';
import { BANK_NAME } from '@/features/banks/banks';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';

type Side = 'receivable' | 'payable';
type StatusTab = 'all' | 'portfoy' | 'ciro_edildi' | 'tahsile_verildi' | 'karsiliksiz';
type GivenTab = 'all' | 'open' | 'overdue' | 'paid' | 'bounced';

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'portfoy', label: 'Portföyde' },
  { key: 'ciro_edildi', label: 'Ciro edildi' },
  { key: 'tahsile_verildi', label: 'Tahsilde' },
  { key: 'karsiliksiz', label: 'Karşılıksız' },
];

const GIVEN_TABS: { key: GivenTab; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'open', label: 'Bekleyen' },
  { key: 'overdue', label: 'Gecikmiş' },
  { key: 'paid', label: 'Ödenen' },
  { key: 'bounced', label: 'Karşılıksız' },
];

// Verilen çek/senetlerin yaşam döngüsü yok; durum doğrudan ödeme durumundan gelir.
function givenGroupOf(o: ObligationWithRelations): Exclude<GivenTab, 'all'> {
  if (o.instrument_status === 'karsiliksiz') return 'bounced';
  if (o.status === 'gecikti') return 'overdue';
  if (o.remaining_amount_minor <= 0 || o.status === 'odendi') return 'paid';
  return 'open';
}
const GIVEN_GROUP_TITLE: Record<Exclude<GivenTab, 'all'>, string> = {
  open: 'Bekleyen',
  overdue: 'Gecikmiş',
  paid: 'Ödenen',
  bounced: 'Karşılıksız',
};

const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

// design CekPortfoyu.html: alınan / verilen çek ve senetler; alınanlar yaşam döngüsü durumuna göre gruplanır.
// Verilen çek/senetlerin yaşam döngüsü yoktur; onlarda filtre ödeme durumuna göredir (Bekleyen/Gecikmiş/Ödenen).
export default function InstrumentsScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [side, setSide] = useState<Side>('receivable');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [givenTab, setGivenTab] = useState<GivenTab>('all');

  const query = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'obligations', 'instruments'] : ['instruments', 'disabled'],
    queryFn: () => listInstruments(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const ratesQuery = useQuery({ queryKey: queryKeys.valueUnitRates(), queryFn: listValueUnitRates });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const received = all.filter((o) => o.direction === 'receivable');
  const given = all.filter((o) => o.direction === 'payable');

  const inPortfolio = instrumentPortfolioRows(all, 'receivable');
  const nearest = inPortfolio
    .filter((o) => o.due_date)
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))[0];

  // Verdiğim sekmesinin "portföy" karşılığı: henüz ödenmemiş (bekleyen + gecikmiş) verilen kayıtlar.
  const givenOpen = instrumentPortfolioRows(all, 'payable');
  const givenNearest = givenOpen
    .filter((o) => o.due_date)
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))[0];

  const summaryLabel = side === 'receivable' ? 'Portföydeki toplam' : 'Ödenecek toplam';
  const summaryCount = side === 'receivable' ? inPortfolio.length : givenOpen.length;
  let summaryTotal: number | null = null;
  let totalError: string | null = ratesQuery.isError || query.isError ? 'Toplam güncellenemedi.' : null;
  if (ratesQuery.data && query.data) {
    try { summaryTotal = instrumentPortfolioTotal(all, side, ratesQuery.data); }
    catch (error) { totalError = error instanceof Error ? error.message : 'Eksik toplam hesaplanmadı.'; }
  }
  const summaryNearest = side === 'receivable' ? nearest : givenNearest;

  const list = side === 'receivable' ? received : given;
  const filtered =
    side === 'receivable'
      ? statusTab !== 'all'
        ? list.filter((o) => instrumentStatusOf(o) === statusTab)
        : list
      : givenTab !== 'all'
        ? list.filter((o) => givenGroupOf(o) === givenTab)
        : list;

  const groups = useMemo(() => {
    if (side === 'payable') {
      const groupOrder: Exclude<GivenTab, 'all'>[] = ['overdue', 'open', 'paid', 'bounced'];
      return groupOrder
        .map((g) => ({ title: GIVEN_GROUP_TITLE[g], rows: filtered.filter((o) => givenGroupOf(o) === g) }))
        .filter((g) => g.rows.length > 0);
    }
    const order: InstrumentStatus[] = ['portfoy', 'tahsile_verildi', 'ciro_edildi', 'karsiliksiz', 'tahsil_edildi'];
    return order
      .map((status) => ({
        title: INSTRUMENT_STATUS_LABEL[status],
        rows: filtered.filter((o) => instrumentStatusOf(o) === status),
      }))
      .filter((g) => g.rows.length > 0);
  }, [filtered, side]);

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{ padding: theme.screenEdge.standard, gap: theme.spacing.lg, paddingBottom: theme.spacing.massive }}
      >
        <ScreenHeader
          title="Çek ve senetler"
          right={{
            icon: 'add',
            accessibilityLabel: 'Yeni çek veya senet',
            variant: 'accent',
            onPress: () => router.push('/obligations/new?type=cek'),
          }}
        />

        <SegmentedControl
          options={[
            { key: 'payable', label: `Verdiğim · ${given.length}` },
            { key: 'receivable', label: `Aldığım · ${received.length}` },
          ]}
          value={side}
          onChange={(k) => setSide(k as Side)}
          stretch
        />

        <Card style={{ gap: 2 }}>
          <Text variant="caption" color="textSecondary">
            {summaryLabel} · {summaryCount} kayıt
          </Text>
          {summaryTotal !== null ? <HeroAmount amountMinor={summaryTotal} baseSize={32} />
            : <Text>{totalError ?? 'TL karşılığı hesaplanıyor…'}</Text>}
          <Text variant="caption" color="textSecondary">Güncel kurla TL karşılığı; karşılıksız kayıtlar dahil değildir.</Text>
          {summaryNearest?.due_date ? (
            <Text variant="caption" color="textSecondary">
              En yakın vade {dayMonth.format(new Date(summaryNearest.due_date))}
            </Text>
          ) : null}
        </Card>

        {side === 'receivable' ? (
          <ScrollableTabs tabs={STATUS_TABS} activeKey={statusTab} onChange={(k) => setStatusTab(k as StatusTab)} />
        ) : (
          <ScrollableTabs tabs={GIVEN_TABS} activeKey={givenTab} onChange={(k) => setGivenTab(k as GivenTab)} />
        )}

        {query.isLoading ? (
          <Stack gap="sm">
            <Skeleton height={72} borderRadius={theme.radius.widget} />
            <Skeleton height={72} borderRadius={theme.radius.widget} />
          </Stack>
        ) : groups.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title={side === 'receivable' ? 'Alınan çek veya senet yok' : 'Verilen çek veya senet yok'}
            message="Çek veya senet taratabilir ya da elle ekleyebilirsin."
            actionLabel="Çek / senet ekle"
            onActionPress={() => router.push('/obligations/new?type=cek')}
          />
        ) : (
          groups.map((group) => (
            <View key={group.title}>
              <Text variant="label" color="textSecondary" style={{ marginBottom: 10 }}>
                {group.title}
              </Text>
              <Group inset={62}>
                {group.rows.map((o, index) => (
                  <InstrumentRow key={o.id} item={o} last={index === group.rows.length - 1} />
                ))}
              </Group>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InstrumentRow({ item }: { item: ObligationWithRelations; last: boolean }) {
  const theme = useTheme();
  const received = item.direction === 'receivable';
  const bank = item.bank_code ? BANK_NAME[item.bank_code] : null;
  const subtitle = [bank, item.counterparty?.name].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/obligations/${item.id}`)}
      style={{ minHeight: 56, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <BankLogo bankCode={item.bank_code} fallbackIcon="document-text-outline" size={34} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontWeight: '500' }}>
          {item.counterparty?.name || item.title}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {item.document_type === 'senet' ? 'Senet' : 'Çek'}
          {subtitle ? ` · ${subtitle}` : ''}
          {item.due_date ? ` · ${dayMonth.format(new Date(item.due_date))}` : ''}
        </Text>
      </View>
      <Text tabular style={{ fontWeight: '600', color: received ? theme.colors.receivable : theme.colors.textPrimary }}>
        {received ? '+' : '−'}
        {formatMinorAmount(item.remaining_amount_minor || item.total_amount_minor, item.currency_code)}
      </Text>
    </Pressable>
  );
}
