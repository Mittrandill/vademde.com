import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { EmptyState, Group, GroupedRow, Skeleton, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { HeroAmount } from '@/components/finance/HeroAmount';
import { ValueUnitBadge } from '@/components/finance/ValueUnitPicker';
import { formatCacheAge } from '@/components/finance/ReferenceValueRow';
import { listAccounts } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { ACTIVE_OBLIGATION_STATUSES, listObligations } from '@/features/obligations/api';
import { VALUE_UNITS, getValueUnit } from '@/features/valueUnits/units';
import { convertToReferenceMinor, isRateStale, listValueUnitRates } from '@/features/valueUnits/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { formatMinorAmount } from '@/utils/money';

const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

// Döviz ve altın görünümü: yeni veri yok, yalnızca mevcut kaynakların birleşimi.
// Kod gerçeği: TRY dışı birim yalnızca nakit/kasa hesaplarında ve vadeli kayıtlarda bulunur.
// TL karşılığı kalıcı saklanmaz; her açılışta güncel kurdan hesaplanır, 36 saatten eski
// kurda uyarı gösterilir (features/valueUnits/api.ts STALE_AFTER_MS).
export default function ValueUnitsScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'account-balances'] : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const obligationsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? [activeWorkspaceId, 'obligations', 'value-units']
      : ['obligations', 'value-units', 'disabled'],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        statuses: ACTIVE_OBLIGATION_STATUSES,
        pageSize: 200,
      }),
    enabled: !!activeWorkspaceId,
  });
  const ratesQuery = useQuery({ queryKey: queryKeys.valueUnitRates(), queryFn: listValueUnitRates });
  const rates = useMemo(() => ratesQuery.data ?? [], [ratesQuery.data]);

  const vaults = useMemo(() => {
    const balanceById = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b.balanceMinor]));
    return (accountsQuery.data ?? [])
      .filter((a) => a.type === 'cash' && a.currency_code !== 'TRY')
      .map((a) => {
        const amountMinor = balanceById.get(a.id) ?? a.opening_balance_minor;
        return {
          account: a,
          amountMinor,
          reference: convertToReferenceMinor(amountMinor, a.currency_code, rates),
        };
      });
  }, [accountsQuery.data, balancesQuery.data, rates]);

  const foreignObligations = useMemo(
    () =>
      (obligationsQuery.data ?? [])
        .filter((o) => o.currency_code !== 'TRY' && o.remaining_amount_minor > 0)
        .map((o) => ({
          obligation: o,
          reference: convertToReferenceMinor(o.remaining_amount_minor, o.currency_code, rates),
        })),
    [obligationsQuery.data, rates]
  );

  const totalReferenceMinor = vaults.reduce((sum, v) => sum + (v.reference?.amountMinor ?? 0), 0);

  const sortedRates = useMemo(() => {
    const order = new Map(VALUE_UNITS.map((u, i) => [u.code, i]));
    return VALUE_UNITS.filter((u) => u.code !== 'TRY').map((unit) => ({
      unit,
      rate: rates.find((r) => r.unit_code === unit.code) ?? null,
    })).sort((a, b) => (order.get(a.unit.code) ?? 0) - (order.get(b.unit.code) ?? 0));
  }, [rates]);

  const staleCount = rates.filter((r) => isRateStale(r.cached_at)).length;
  const newestCache = rates.reduce<string | null>((n, r) => (!n || r.cached_at > n ? r.cached_at : n), null);
  const loading = accountsQuery.isLoading || ratesQuery.isLoading;

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          gap: theme.spacing.lg,
          paddingBottom: theme.spacing.massive,
        }}
      >
        <ScreenHeader
          title="Döviz ve altın"
          right={{
            icon: 'add',
            accessibilityLabel: 'Yeni kasa',
            variant: 'accent',
            onPress: () => router.push('/accounts/new'),
          }}
        />

        {loading ? (
          <Stack gap="md">
            <Skeleton height={90} borderRadius={theme.radius.widget} />
            <Skeleton height={64} borderRadius={theme.radius.widget} />
          </Stack>
        ) : (
          <>
            <View
              style={{
                gap: theme.spacing.xs,
                padding: theme.spacing.lg,
                borderRadius: theme.radius.widget,
                backgroundColor: theme.colors.surfacePrimary,
              }}
            >
              <Text variant="body" color="textSecondary" style={{ fontWeight: '500' }}>
                Kasalardaki TL karşılığı
              </Text>
              <HeroAmount amountMinor={totalReferenceMinor} baseSize={48} />
              <Text variant="caption" color="textSecondary">
                Kalıcı saklanmaz; her açılışta güncel kurdan hesaplanır.
              </Text>
            </View>

            {newestCache ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                <Ionicons
                  name={staleCount > 0 ? 'time-outline' : 'checkmark-circle-outline'}
                  size={theme.iconSize.lg}
                  color={staleCount > 0 ? theme.colors.attentionMarker : theme.colors.receivable}
                />
                <Text variant="caption" style={{ flex: 1 }}>
                  Kurlar {formatCacheAge(newestCache)} güncellendi
                  {staleCount > 0 ? ` · ${staleCount} kur eski` : ''}
                </Text>
              </View>
            ) : null}

            <Stack gap="xs">
              <Text variant="label" color="textSecondary" style={{ paddingLeft: theme.spacing.xxs }}>
                Kasalar · {vaults.length} nakit hesap
              </Text>
              {vaults.length === 0 ? (
                <EmptyState
                  icon="wallet-outline"
                  title="Döviz veya altın kasası yok"
                  message="Nakit hesap eklerken Amerikan Doları, Euro veya altın gibi bir birim seçebilirsin."
                />
              ) : (
                <Group inset={72}>
                {vaults.map((v) => (
                  <Row
                    key={v.account.id}
                    onPress={() => router.push(`/accounts/${v.account.id}`)}
                    unitCode={v.account.currency_code}
                    title={v.account.name}
                    subtitle={`Nakit · ${getValueUnit(v.account.currency_code).name}`}
                    amount={formatMinorAmount(v.amountMinor, v.account.currency_code)}
                    reference={v.reference?.amountMinor ?? null}
                    stale={v.reference?.isStale ? formatCacheAge(v.reference.cachedAt) : null}
                  />
                ))}
                </Group>
              )}
            </Stack>

            {foreignObligations.length > 0 ? (
              <Stack gap="xs">
                <Text variant="label" color="textSecondary" style={{ paddingLeft: theme.spacing.xxs }}>
                  Altın ve döviz borç / alacak · {foreignObligations.length}
                </Text>
                <Group inset={72}>
                {foreignObligations.map(({ obligation: o, reference }) => (
                  <Row
                    key={o.id}
                    onPress={() => router.push(`/obligations/${o.id}`)}
                    unitCode={o.currency_code}
                    title={o.counterparty?.name ?? o.title}
                    subtitle={o.direction === 'payable' ? 'Borç' : 'Alacak'}
                    amount={formatMinorAmount(o.remaining_amount_minor, o.currency_code)}
                    reference={reference?.amountMinor ?? null}
                    stale={reference?.isStale ? formatCacheAge(reference.cachedAt) : null}
                    trailing={o.due_date ? dayMonth.format(new Date(o.due_date)) : undefined}
                  />
                ))}
                </Group>
              </Stack>
            ) : null}

            <Stack gap="xs">
              <Text variant="label" color="textSecondary" style={{ paddingLeft: theme.spacing.xxs }}>
                Güncel kurlar TL karşılığı
              </Text>
              <Group inset={64}>
                {sortedRates.map(({ unit, rate }) => (
                  <GroupedRow
                    key={unit.code}
                    leading={<ValueUnitBadge unitCode={unit.code} size={34} />}
                    title={unit.name}
                    trailing={
                      rate ? (
                        <Text tabular style={{ fontWeight: '600' }}>
                          {formatMinorAmount(rate.try_equivalent_minor)}
                        </Text>
                      ) : (
                        <Text variant="caption" color="textSecondary">
                          kur yok
                        </Text>
                      )
                    }
                  />
                ))}
              </Group>
              <Text variant="caption" color="textSecondary" style={{ paddingTop: theme.spacing.xxs, paddingLeft: theme.spacing.xxs }}>
                Kuru olmayan birimlerde TL karşılığı gösterilmez; kayıt kendi biriminde tutulur.
              </Text>
            </Stack>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

interface RowProps {
  onPress: () => void;
  unitCode: string;
  title: string;
  subtitle: string;
  amount: string;
  reference: number | null;
  stale: string | null;
  trailing?: string;
}

function Row({ onPress, unitCode, title, subtitle, amount, reference, stale, trailing }: RowProps) {
  const theme = useTheme();

  return (
    <GroupedRow
      onPress={onPress}
      chevron={false}
      leading={<ValueUnitBadge unitCode={unitCode} size={40} />}
      title={title}
      subtitle={subtitle}
      trailing={
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text style={{ fontWeight: '600' }} tabular>
            {amount}
          </Text>
          {reference !== null ? (
            <Text variant="caption" color="textSecondary" tabular>
              ≈ {formatMinorAmount(reference)}
            </Text>
          ) : (
            <Text variant="caption" color="textSecondary">
              kur yok
            </Text>
          )}
          {stale ? (
            <Text variant="caption" style={{ color: theme.colors.attentionMarker }}>
              {stale}
            </Text>
          ) : trailing ? (
            <Text variant="caption" color="textSecondary" tabular>
              {trailing}
            </Text>
          ) : null}
        </View>
      }
    />
  );
}
