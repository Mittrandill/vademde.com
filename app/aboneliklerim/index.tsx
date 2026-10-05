import { Fragment, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { EmptyState, Pressable, ScrollableTabs, Skeleton, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { HeroAmount } from '@/components/finance/HeroAmount';
import { ServiceLogo } from '@/components/finance/ServiceLogo';
import { SERVICE_NAME } from '@/features/services/services';
import { ACTIVE_OBLIGATION_STATUSES, listInstallmentsDue, type ObligationDueItem } from '@/features/obligations/api';
import { convertToReferenceMinor, listValueUnitRates } from '@/features/valueUnits/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { formatMinorAmount, formatValueUnitAmount } from '@/utils/money';

type SortKey = 'upcoming' | 'price' | 'category' | 'account';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'upcoming', label: 'Yaklaşan' },
  { key: 'price', label: 'Pahalıdan ucuza' },
  { key: 'category', label: 'Kategori' },
  { key: 'account', label: 'Kart' },
];

const DAY_MS = 86_400_000;
const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

interface SubscriptionRow {
  item: ObligationDueItem;
  dueDate: Date;
  daysLeft: number;
  /** Aylık maliyetin TL karşılığı; kuru olmayan birimde null. */
  referenceMinor: number | null;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Aboneliklerim: obligations.document_type = 'abonelik' kayıtlarının sıradaki (ödenmemiş en
// yakın) taksiti. Yeni veri/şema yok; her abonelik aylık taksit planı olarak tutulduğundan
// bir taksitin tutarı aylık maliyettir. TRY dışı kayıtlar güncel kurla TL'ye çevrilir
// (kalıcı saklanmaz, bkz. docs/01 §3.5).
export default function SubscriptionsScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [sort, setSort] = useState<SortKey>('upcoming');

  const installmentsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? [activeWorkspaceId, 'obligations', 'subscriptions-installments']
      : ['subscriptions-installments', 'disabled'],
    queryFn: () =>
      listInstallmentsDue({
        workspaceId: activeWorkspaceId as string,
        direction: 'payable',
        statuses: ACTIVE_OBLIGATION_STATUSES,
        pageSize: 500,
      }),
    enabled: !!activeWorkspaceId,
  });

  const ratesQuery = useQuery({ queryKey: queryKeys.valueUnitRates(), queryFn: listValueUnitRates });
  const rates = useMemo(() => ratesQuery.data ?? [], [ratesQuery.data]);

  const rows = useMemo<SubscriptionRow[]>(() => {
    const today = startOfDay(new Date());
    const next = new Map<string, ObligationDueItem>();
    for (const o of installmentsQuery.data ?? []) {
      if (o.document_type !== 'abonelik' || o.remaining_amount_minor <= 0 || !o.due_date) continue;
      const current = next.get(o.id);
      if (!current || new Date(o.due_date) < new Date(current.due_date as string)) next.set(o.id, o);
    }
    return [...next.values()].map((item) => {
      const dueDate = startOfDay(new Date(item.due_date as string));
      return {
        item,
        dueDate,
        daysLeft: Math.round((dueDate.getTime() - today.getTime()) / DAY_MS),
        referenceMinor:
          convertToReferenceMinor(item.total_amount_minor, item.currency_code, rates)?.amountMinor ?? null,
      };
    });
  }, [installmentsQuery.data, rates]);

  const monthlyTotalMinor = rows.reduce((sum, r) => sum + (r.referenceMinor ?? 0), 0);
  const hasForeign = rows.some((r) => r.item.currency_code !== 'TRY');

  const groups = useMemo(() => {
    const sorted = [...rows];
    if (sort === 'price') {
      sorted.sort((a, b) => (b.referenceMinor ?? 0) - (a.referenceMinor ?? 0));
      return [{ title: 'Tümü', rows: sorted }];
    }
    sorted.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    if (sort === 'category' || sort === 'account') {
      const byLabel = new Map<string, SubscriptionRow[]>();
      for (const r of sorted) {
        const label =
          (sort === 'category' ? r.item.category?.name : r.item.account?.name) ??
          (sort === 'category' ? 'Kategorisiz' : 'Hesap yok');
        byLabel.set(label, [...(byLabel.get(label) ?? []), r]);
      }
      return [...byLabel.entries()].map(([title, list]) => ({ title, rows: list }));
    }
    const now = new Date();
    const buckets: { title: string; rows: SubscriptionRow[] }[] = [
      { title: 'Bu hafta', rows: [] },
      { title: 'Bu ay', rows: [] },
      { title: 'Daha sonra', rows: [] },
    ];
    for (const r of sorted) {
      const idx =
        r.daysLeft <= 7
          ? 0
          : r.dueDate.getMonth() === now.getMonth() && r.dueDate.getFullYear() === now.getFullYear()
            ? 1
            : 2;
      buckets[idx].rows.push(r);
    }
    return buckets.filter((b) => b.rows.length > 0);
  }, [rows, sort]);

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{ padding: theme.screenEdge.standard, gap: theme.spacing.lg, paddingBottom: theme.spacing.massive }}
      >
        <ScreenHeader
          title="Aboneliklerim"
          right={{
            icon: 'add',
            accessibilityLabel: 'Yeni abonelik',
            variant: 'accent',
            onPress: () => router.push('/obligations/new?type=abonelik'),
          }}
        />

        {installmentsQuery.isLoading ? (
          <Stack gap="md">
            <Skeleton height={80} borderRadius={theme.radius.widget} />
            <Skeleton height={64} borderRadius={theme.radius.widget} />
            <Skeleton height={64} borderRadius={theme.radius.widget} />
          </Stack>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="repeat-outline"
            title="Henüz abonelik yok"
            message="Netflix, Spotify gibi düzenli ödemelerini ekle; aylık toplamını ve yenileme tarihlerini burada gör."
          />
        ) : (
          <>
            <Stack gap="xs">
              <Text variant="body" color="textSecondary" style={{ fontWeight: '500' }}>
                Aylık toplam
              </Text>
              <HeroAmount amountMinor={monthlyTotalMinor} baseSize={48} />
              <Text variant="caption" color="textSecondary">
                {rows.length} abonelik · yılda yaklaşık {formatMinorAmount(monthlyTotalMinor * 12).replace(/,\d{2}(?=\D*$)/, '')}
                {hasForeign ? ' · döviz olanlar bugünkü kurla' : ''}
              </Text>
            </Stack>

            <ScrollableTabs tabs={SORTS} activeKey={sort} onChange={(k) => setSort(k as SortKey)} />

            {groups.map((group) => (
              <Fragment key={group.title}>
                <Stack gap="xxs">
                  <Text variant="label" color="textSecondary">
                    {group.title}
                  </Text>
                  {group.rows.map((r, index) => (
                    <SubscriptionRowView key={r.item.id} row={r} last={index === group.rows.length - 1} />
                  ))}
                </Stack>
              </Fragment>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SubscriptionRowView({ row, last }: { row: SubscriptionRow; last: boolean }) {
  const theme = useTheme();
  const { item, daysLeft, dueDate, referenceMinor } = row;
  const foreign = item.currency_code !== 'TRY';
  const tag = daysLeft <= 0 ? 'Bugün' : daysLeft === 1 ? 'Yarın' : `${daysLeft} gün`;
  const name = (item.service_code && SERVICE_NAME[item.service_code]) || item.title;
  const subtitle = [item.category?.name, item.account?.name, dayMonth.format(dueDate)].filter(Boolean).join(' · ');
  const amountText =
    item.value_unit_type === 'kiymetli_maden'
      ? formatValueUnitAmount(item.total_amount_minor, item.currency_code)
      : formatMinorAmount(item.total_amount_minor, item.currency_code);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/obligations/${item.id}`)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <ServiceLogo serviceCode={item.service_code} fallbackName={name} size={44} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text variant="cardTitle" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text variant="cardTitle" tabular>
          {amountText}
        </Text>
        {foreign && referenceMinor !== null ? (
          <Text variant="caption" color="textSecondary" tabular>
            ≈ {formatMinorAmount(referenceMinor)}
          </Text>
        ) : null}
        <Text variant="label" style={{ textTransform: 'none', color: theme.colors.payable }}>
          {tag}
        </Text>
      </View>
    </Pressable>
  );
}
