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
import { INSTRUMENT_STATUS_LABEL, instrumentStatusOf, listInstruments, type InstrumentStatus } from '@/features/instruments/api';
import type { ObligationWithRelations } from '@/features/obligations/api';
import { BANK_NAME } from '@/features/banks/banks';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';

type Side = 'receivable' | 'payable';
type StatusTab = 'all' | 'portfoy' | 'ciro_edildi' | 'tahsile_verildi' | 'karsiliksiz';

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'portfoy', label: 'Portföyde' },
  { key: 'ciro_edildi', label: 'Ciro edildi' },
  { key: 'tahsile_verildi', label: 'Tahsilde' },
  { key: 'karsiliksiz', label: 'Karşılıksız' },
];

const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

// design CekPortfoyu.html: alınan / verilen çek ve senetler; alınanlar yaşam döngüsü durumuna göre gruplanır.
// Verilen çek/senetlerin yaşam döngüsü yoktur (ödenene kadar vadeli kayıt), bu yüzden durum sekmeleri yalnızca "Alınan"da.
export default function InstrumentsScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [side, setSide] = useState<Side>('receivable');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');

  const query = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'obligations', 'instruments'] : ['instruments', 'disabled'],
    queryFn: () => listInstruments(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const received = all.filter((o) => o.direction === 'receivable');
  const given = all.filter((o) => o.direction === 'payable');

  const inPortfolio = received.filter((o) => instrumentStatusOf(o) === 'portfoy');
  const portfolioTotal = inPortfolio.reduce((s, o) => s + o.remaining_amount_minor, 0);
  const nearest = inPortfolio
    .filter((o) => o.due_date)
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))[0];

  const list = side === 'receivable' ? received : given.filter((o) => o.remaining_amount_minor > 0);
  const filtered = side === 'receivable' && statusTab !== 'all' ? list.filter((o) => instrumentStatusOf(o) === statusTab) : list;

  const groups = useMemo(() => {
    if (side === 'payable') return [{ title: 'Verilen', rows: filtered }];
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

        {side === 'receivable' ? (
          <Card style={{ gap: 2 }}>
            <Text variant="caption" color="textSecondary">
              Portföydeki toplam · {inPortfolio.length} kayıt
            </Text>
            <HeroAmount amountMinor={portfolioTotal} baseSize={32} />
            {nearest?.due_date ? (
              <Text variant="caption" color="textSecondary">
                En yakın vade {dayMonth.format(new Date(nearest.due_date))}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {side === 'receivable' ? (
          <ScrollableTabs tabs={STATUS_TABS} activeKey={statusTab} onChange={(k) => setStatusTab(k as StatusTab)} />
        ) : null}

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
