import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { EmptyState, Group, GroupedRow, GroupedRowIcon, Skeleton, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { HeroAmount } from '@/components/finance/HeroAmount';
import { FORECAST_DAYS, TOTAL_FORECAST_ID, useCashForecasts } from '@/features/cashflow/useCashForecasts';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';

const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
const dayMonthShort = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const CHART_HEIGHT = 140;
const CHART_WIDTH = 330;

// design NakitUyari.html: hesabın önümüzdeki 30 günlük tahmini bakiyesi. Tahmin yalnızca
// kayıtlı vadelerden gelir (obligations.account_id = ödeme hesabı); gerçek bakiyeyi garanti etmez.
export default function CashAlertScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { forecasts, isLoading } = useCashForecasts(activeWorkspaceId);
  const item = forecasts.find((f) => f.accountId === accountId) ?? null;

  const chart = useMemo(() => {
    if (!item) return null;
    const values = item.forecast.points.map((p) => p.balanceMinor);
    const min = Math.min(0, ...values);
    const max = Math.max(1, ...values);
    const span = max - min || 1;
    const x = (i: number) => (i / FORECAST_DAYS) * CHART_WIDTH;
    const y = (v: number) => CHART_HEIGHT - ((v - min) / span) * CHART_HEIGHT;
    const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    return { path, zeroY: y(0), negativeFrom: min < 0 };
  }, [item]);

  const bestSource = useMemo(
    () =>
      forecasts
        .filter((f) => f.accountId !== accountId && f.accountId !== TOTAL_FORECAST_ID && f.forecast.lowestMinor > 0)
        .sort((a, b) => b.forecast.lowestMinor - a.forecast.lowestMinor)[0] ?? null,
    [forecasts, accountId]
  );

  const isTotal = accountId === TOTAL_FORECAST_ID;
  const shortfallMinor = item ? Math.max(0, -item.forecast.lowestMinor) : 0;
  const neededMinor = Math.ceil(shortfallMinor / 100_000) * 100_000; // 1.000 TL'ye yuvarla
  const transferMinor = bestSource && !isTotal ? Math.min(neededMinor, bestSource.forecast.lowestMinor) : 0;
  const first = item?.forecast.firstNegative ?? null;

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{ padding: theme.screenEdge.standard, gap: theme.spacing.lg, paddingBottom: theme.spacing.massive }}
      >
        <ScreenHeader title="Nakit uyarısı" />

        {isLoading ? (
          <Stack gap="md">
            <Skeleton height={80} borderRadius={theme.radius.widget} />
            <Skeleton height={160} borderRadius={theme.radius.widget} />
          </Stack>
        ) : !item || !chart ? (
          <EmptyState icon="wallet-outline" title="Hesap bulunamadı" message="Bu hesap için tahmin hesaplanamadı." />
        ) : (
          <>
            <Stack gap="xs">
              <Text variant="sectionTitle">
                {first
                  ? `${item.name} ${dayMonth.format(new Date(first.date))} tarihinde eksiye düşebilir`
                  : `${item.name} önümüzdeki ${FORECAST_DAYS} gün eksiye düşmüyor`}
              </Text>
              <Text variant="body" color="textSecondary">
                {isTotal
                  ? 'Tüm TL hesapların toplam bakiyesine, hesabı atanmamış kayıtlar dahil tüm kayıtlı vadeler uygulanır.'
                  : 'Tahmin, bu hesaptan ödenecek / bu hesaba tahsil edilecek kayıtlı vadelere dayanır.'}
              </Text>
            </Stack>

            <View
              style={{
                gap: theme.spacing.md,
                padding: theme.spacing.lg,
                borderRadius: theme.radius.widget,
                backgroundColor: theme.colors.surfacePrimary,
              }}
            >
            <Stack gap="xs">
              <Text variant="label" color="textSecondary">
                Tahmini en düşük bakiye
              </Text>
              <HeroAmount amountMinor={item.forecast.lowestMinor} baseSize={48} color={item.forecast.lowestMinor < 0 ? 'danger' : 'textPrimary'} />
            </Stack>
            <View accessible accessibilityLabel={`Önümüzdeki ${FORECAST_DAYS} günlük tahmini bakiye grafiği`}>
              <Svg width="100%" height={CHART_HEIGHT + 4} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + 4}`} preserveAspectRatio="none">
                {chart.negativeFrom ? (
                  <Rect x={0} y={chart.zeroY} width={CHART_WIDTH} height={CHART_HEIGHT - chart.zeroY + 4} fill={theme.colors.danger} opacity={0.08} />
                ) : null}
                <Line x1={0} x2={CHART_WIDTH} y1={chart.zeroY} y2={chart.zeroY} stroke={theme.colors.border} strokeWidth={1} strokeDasharray="4 4" />
                <Path d={chart.path} stroke={theme.colors.payable} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
              </Svg>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.spacing.xxs }}>
                <Text variant="label" color="textPrimary" style={{ textTransform: 'none' }}>
                  Bugün
                </Text>
                {first ? (
                  <Text variant="label" color="textSecondary" tabular style={{ textTransform: 'none' }}>
                    {dayMonthShort.format(new Date(first.date))}
                  </Text>
                ) : null}
                <Text variant="label" color="textSecondary" tabular style={{ textTransform: 'none' }}>
                  {dayMonthShort.format(new Date(item.forecast.points[item.forecast.points.length - 1].date))}
                </Text>
              </View>
            </View>
            </View>

            <Stack gap="xs">
              <Text variant="label" color="textSecondary" style={{ paddingLeft: theme.spacing.xxs }}>
                Bu hesaptan çıkacaklar
              </Text>
              {item.forecast.outgoing.length === 0 ? (
                <Text variant="body" color="textSecondary" style={{ paddingLeft: theme.spacing.xxs }}>
                  Bu hesaba bağlı ödenecek kayıt yok.
                </Text>
              ) : (
                <Group inset={16}>
                  {item.forecast.outgoing.map((o) => (
                    <GroupedRow
                      key={`${o.obligationId}-${o.dueDate}`}
                      onPress={() => router.push(`/obligations/${o.obligationId}`)}
                      chevron={false}
                      title={o.title}
                      subtitle={dayMonthShort.format(new Date(o.dueDate))}
                      trailing={
                        <Text tabular style={{ fontWeight: '600' }}>
                          −{formatMinorAmount(o.amountMinor)}
                        </Text>
                      }
                    />
                  ))}
                </Group>
              )}
            </Stack>

            {first ? (
              <Stack gap="xs">
                <Text variant="label" color="textSecondary" style={{ paddingLeft: theme.spacing.xxs }}>
                  Ne yapabilirsin?
                </Text>
                <Group>
                  {bestSource && transferMinor > 0 ? (
                    <GroupedRow
                      leading={<GroupedRowIcon name="swap-horizontal-outline" />}
                      title={`${bestSource.name}'dan ${formatMinorAmount(transferMinor).replace(/,00$/, '')} aktar`}
                      onPress={() => router.push(`/transactions/new?direction=transfer&accountId=${bestSource.accountId}`)}
                    />
                  ) : null}
                  {item.forecast.outgoing[0] ? (
                    <GroupedRow
                      leading={<GroupedRowIcon name="create-outline" />}
                      title="Ödeme hesabını değiştir"
                      onPress={() => router.push(`/obligations/${item.forecast.outgoing[0].obligationId}`)}
                    />
                  ) : null}
                </Group>
              </Stack>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
