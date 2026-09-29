import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { withAlpha } from '@/theme/colors';
import { Button, Card, Divider, Pressable, Row, SegmentedControl, Stack, Text } from '@/components/primitives';
import {
  currentPeriodMonth,
  getAllPlanLimits,
  getCurrentOcrUsage,
  getMySubscription,
  type PlanCode,
  type PlanLimits,
} from '@/features/subscriptions/api';
import {
  freeTrialDays,
  getOfferings,
  getTrialEligibility,
  purchasePackage,
  restorePurchases,
} from '@/services/purchases';
import { queryKeys } from '@/services/queryKeys';

type BillingPeriod = 'monthly' | 'yearly';

const PLAN_LABELS: Record<PlanCode, string> = {
  free: 'Ücretsiz',
  plus: 'Vademde Plus',
  isletme: 'Vademde İşletme',
};

const PLAN_SHORT_LABELS: Record<PlanCode, string> = {
  free: 'Ücretsiz',
  plus: 'Plus',
  isletme: 'İşletme',
};

// Türkçe ek uyumu kod içinde türetilemez; plan başına sabit yazılır.
const PLAN_STATUS_LABELS: Record<PlanCode, string> = {
  free: 'Ücretsiz plandasınız',
  plus: 'Plus planındasınız',
  isletme: 'İşletme planındasınız',
};

const PLAN_CTA_LABELS: Record<PlanCode, string> = {
  free: 'Ücretsiz planda kal',
  plus: "Plus'a geç",
  isletme: "İşletme'ye geç",
};

const TABLE_LABEL_WIDTH_FLEX = 1;
const TABLE_COLUMN_WIDTH = 64;

// Karşılaştırma tablosu plan_limits alanlarından türetilir (docs/10-abonelik-gelir-modeli.md);
// etiketler kullanıcının tanıdığı adlarla yazılır (ör. "audit log" değil).
const COMPARISON_ROWS: { label: string; value: (limits: PlanLimits) => string }[] = [
  { label: 'Belge tarama / ay', value: (l) => String(l.monthly_ocr_quota) },
  { label: 'Çalışma alanı', value: (l) => String(l.max_personal_workspaces) },
  { label: 'Ekip üyesi', value: (l) => (l.max_team_members ? String(l.max_team_members) : '—') },
  { label: 'Gelişmiş raporlar', value: (l) => (l.advanced_reports ? 'Var' : '—') },
  { label: 'Belge arşivi', value: (l) => (l.document_archive ? 'Var' : '—') },
  { label: 'Manuel giriş', value: () => 'Var' },
];

function formatPrice(value: number, currencyCode: string): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(value);
}

// Yıllık planın aylık plana göre kazancı; oran sabit yazılmaz, mağaza fiyatlarından hesaplanır
// (fiyat değişirse rozet de kendiliğinden doğru kalır). İkisi de yoksa gösterilmez.
function yearlySavingPercent(offering: PurchasesOffering | undefined): number | null {
  const monthly = offering?.monthly?.product.price;
  const annual = offering?.annual?.product.price;
  if (!monthly || !annual) return null;
  const percent = Math.round((1 - annual / (monthly * 12)) * 100);
  return percent > 0 ? percent : null;
}

export default function PaywallScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const queryClient = useQueryClient();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('yearly');
  const [chosenPlan, setChosenPlan] = useState<PlanCode | null>(null);
  const [purchasingPlan, setPurchasingPlan] = useState<PlanCode | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const planLimitsQuery = useQuery({
    queryKey: queryKeys.planLimits(),
    queryFn: getAllPlanLimits,
  });

  const offeringsQuery = useQuery({
    queryKey: ['revenuecat-offerings'],
    queryFn: getOfferings,
  });

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.subscription(),
    queryFn: getMySubscription,
  });

  const ocrUsageQuery = useQuery({
    queryKey: queryKeys.ocrUsage(currentPeriodMonth()),
    queryFn: getCurrentOcrUsage,
  });

  const planLimits = useMemo(() => planLimitsQuery.data ?? [], [planLimitsQuery.data]);
  const paidPlans = useMemo(() => planLimits.filter((limits) => limits.plan !== 'free'), [planLimits]);
  const currentPlan = (subscriptionQuery.data?.plan as PlanCode) ?? 'free';

  // Varsayılan seçim: kullanıcının bulunmadığı ilk ücretli plan (ücretsizde Plus).
  // Kullanıcı seçim yapana kadar türetilir; plan listesi geç gelse de doğru kalır.
  const defaultPlan = (paidPlans.find((limits) => limits.plan !== currentPlan) ?? paidPlans[0])?.plan as
    | PlanCode
    | undefined;
  const selectedPlan = chosenPlan ?? defaultPlan ?? null;

  function resolvePackage(plan: PlanCode): PurchasesPackage | null {
    if (plan === 'free') return null;
    const offering = offeringsQuery.data?.all[plan];
    if (!offering) return null;
    return billingPeriod === 'yearly' ? offering.annual : offering.monthly;
  }

  const selectedPackage = selectedPlan ? resolvePackage(selectedPlan) : null;
  const savingPercent = selectedPlan ? yearlySavingPercent(offeringsQuery.data?.all[selectedPlan]) : null;
  const isCurrentSelected = selectedPlan === currentPlan;
  const product = selectedPackage?.product;

  // Tüm ücretli paketlerin deneme uygunluğu tek sorguda alınır; kullanıcı dönem/plan değiştirdikçe
  // yeniden ağ çağrısı yapılmaz.
  const paidProductIds = useMemo(() => {
    const ids: string[] = [];
    for (const [key, offering] of Object.entries(offeringsQuery.data?.all ?? {})) {
      if (key === 'free') continue;
      if (offering.monthly) ids.push(offering.monthly.product.identifier);
      if (offering.annual) ids.push(offering.annual.product.identifier);
    }
    return ids;
  }, [offeringsQuery.data]);
  const trialEligibilityQuery = useQuery({
    queryKey: ['trial-eligibility', paidProductIds.join(',')],
    queryFn: () => getTrialEligibility(paidProductIds),
    enabled: paidProductIds.length > 0,
  });
  const trialDays =
    product && trialEligibilityQuery.data?.[product.identifier] ? freeTrialDays(product) : null;

  async function handlePurchase() {
    if (!selectedPlan || !selectedPackage) {
      Alert.alert('Plan şu anda satın alınamıyor', 'Mağaza fiyatları alınamadı, lütfen daha sonra tekrar deneyin.');
      return;
    }
    setPurchasingPlan(selectedPlan);
    try {
      await purchasePackage(selectedPackage);
      await queryClient.invalidateQueries({ queryKey: queryKeys.subscription() });
      // Plan değişince çalışma alanı/ekip limitleri de değişir; kilit anında kalkmalı.
      await queryClient.invalidateQueries({ queryKey: queryKeys.planEnforcement() });
      await queryClient.invalidateQueries({ queryKey: ['document-archive-access'] });
      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Satın alma tamamlanamadı';
      if (!message.toLowerCase().includes('cancel')) {
        Alert.alert('Satın alma başarısız', message);
      }
    } finally {
      setPurchasingPlan(null);
    }
  }

  async function handleRestore() {
    setIsRestoring(true);
    try {
      await restorePurchases();
      await queryClient.invalidateQueries({ queryKey: queryKeys.subscription() });
      // Plan değişince çalışma alanı/ekip limitleri de değişir; kilit anında kalkmalı.
      await queryClient.invalidateQueries({ queryKey: queryKeys.planEnforcement() });
      await queryClient.invalidateQueries({ queryKey: ['document-archive-access'] });
      Alert.alert('Satın alımlar geri yüklendi');
      router.back();
    } catch (err) {
      Alert.alert('Geri yükleme başarısız', err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsRestoring(false);
    }
  }

  const priceSubline = !product
    ? null
    : billingPeriod === 'yearly'
      ? `/ yıl · ayda ${formatPrice(product.price / 12, product.currencyCode)}`
      : '/ ay';

  const storeName = Platform.OS === 'android' ? 'Google Play' : 'App Store';

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Row
        style={{
          justifyContent: 'space-between',
          paddingHorizontal: theme.screenEdge.standard,
          paddingTop: theme.spacing.xs,
          paddingBottom: theme.spacing.xs,
        }}
      >
        <Pressable accessibilityRole="button" accessibilityLabel="Kapat" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Satın alımları geri yükle"
          onPress={handleRestore}
          disabled={isRestoring}
          hitSlop={12}
        >
          {isRestoring ? (
            <ActivityIndicator size="small" color={theme.colors.textSecondary} />
          ) : (
            <Text variant="body" color="textSecondary">
              Geri yükle
            </Text>
          )}
        </Pressable>
      </Row>

      {planLimitsQuery.isPending ? (
        <Stack align="center" style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.brandPrimary} />
        </Stack>
      ) : planLimitsQuery.isError ? (
        <Stack
          gap="md"
          align="center"
          style={{ flex: 1, justifyContent: 'center', padding: theme.screenEdge.standard }}
        >
          <Text variant="cardTitle">Planlar yüklenemedi</Text>
          <Text variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
            Bağlantınızı kontrol edip tekrar deneyin.
          </Text>
          <Button label="Tekrar dene" variant="secondary" onPress={() => planLimitsQuery.refetch()} />
        </Stack>
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              padding: theme.screenEdge.standard,
              paddingTop: theme.spacing.sm,
              paddingBottom: theme.spacing.xl,
              gap: theme.spacing.lg,
            }}
          >
            <Stack gap="xs">
              <Text variant="caption" style={{ color: theme.colors.brandPrimary, fontWeight: '700', letterSpacing: 1.2 }}>
                VADEMDE PREMIUM
              </Text>
              <Text variant="pageTitle">Tarayan hiç yazmaz.</Text>
              <Text variant="body" color="textSecondary">
                {PLAN_STATUS_LABELS[currentPlan] ?? PLAN_STATUS_LABELS.free}
                {ocrUsageQuery.data
                  ? ` · bu ay ${ocrUsageQuery.data.usedCount}/${ocrUsageQuery.data.quota} belge okundu`
                  : ''}
              </Text>
            </Stack>

            {trialDays ? (
              <Row
                gap="sm"
                align="center"
                style={{
                  padding: theme.spacing.sm,
                  borderRadius: theme.radius.widget,
                  backgroundColor: withAlpha(theme.colors.brandPrimary, 0.12),
                  borderWidth: 1,
                  borderColor: withAlpha(theme.colors.brandPrimary, 0.4),
                }}
              >
                <Ionicons name="gift-outline" size={22} color={theme.colors.brandPrimary} />
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="cardTitle">{trialDays} gün ücretsiz dene</Text>
                  <Text variant="caption" color="textSecondary">
                    Deneme bitmeden iptal edersen ücret ödemezsin.
                  </Text>
                </Stack>
              </Row>
            ) : null}

            <Stack gap="sm">
              <SegmentedControl
                stretch
                options={[
                  { key: 'monthly', label: 'Aylık' },
                  { key: 'yearly', label: savingPercent ? `Yıllık · -%${savingPercent}` : 'Yıllık' },
                ]}
                value={billingPeriod}
                onChange={setBillingPeriod}
              />
              <SegmentedControl
                stretch
                options={paidPlans.map((limits) => ({
                  key: limits.plan,
                  label: PLAN_SHORT_LABELS[limits.plan as PlanCode] ?? limits.plan,
                }))}
                value={selectedPlan ?? ''}
                onChange={(plan) => setChosenPlan(plan as PlanCode)}
              />
            </Stack>

            <Stack gap="xxs" align="center">
              <Text variant="caption" color="textSecondary">
                {selectedPlan ? PLAN_LABELS[selectedPlan] : ''}
              </Text>
              <Text variant="displayBalance" tabular>
                {product?.priceString ?? '—'}
              </Text>
              {priceSubline ? (
                <Text variant="caption" color="textSecondary" tabular>
                  {priceSubline}
                </Text>
              ) : null}
            </Stack>

            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <ComparisonTable planLimits={planLimits} selectedPlan={selectedPlan} />
            </Card>
          </ScrollView>

          <Divider />
          <Stack
            gap="xs"
            style={{
              paddingHorizontal: theme.screenEdge.standard,
              paddingTop: theme.spacing.sm,
              paddingBottom: theme.spacing.xs,
            }}
          >
            <Button
              label={
                isCurrentSelected
                  ? 'Mevcut planınız'
                  : selectedPackage
                    ? trialDays
                      ? `${trialDays} gün ücretsiz başlat`
                      : `${PLAN_CTA_LABELS[selectedPlan as PlanCode]} · ${selectedPackage.product.priceString}`
                    : PLAN_CTA_LABELS[selectedPlan as PlanCode] ?? 'Planı seçin'
              }
              onPress={handlePurchase}
              loading={purchasingPlan !== null}
              disabled={!selectedPackage || isCurrentSelected || purchasingPlan !== null}
            />
            <Text variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>
              {!selectedPackage && !isCurrentSelected
                ? 'Mağaza fiyatları şu anda alınamıyor.'
                : trialDays && product
                  ? `${trialDays} gün ücretsiz, sonra ${product.priceString}${billingPeriod === 'yearly' ? ' / yıl' : ' / ay'}. İstediğiniz zaman iptal edebilirsiniz. ${storeName} üzerinden faturalanır.`
                  : `${storeName} üzerinden faturalanır. İstediğiniz zaman iptal edebilirsiniz.`}
            </Text>
            {/* App Store Review Guideline 3.1.2 — otomatik yenilenen abonelik satan ekranda
                Gizlilik Politikası ve Kullanım Koşulları'na işlevsel bağlantı zorunludur. */}
            <Row gap="md" style={{ justifyContent: 'center' }}>
              <Pressable onPress={() => router.push('/legal/terms-of-service')} hitSlop={8}>
                <Text variant="caption" style={{ textDecorationLine: 'underline' }} color="textSecondary">
                  Kullanım Koşulları
                </Text>
              </Pressable>
              <Pressable onPress={() => router.push('/legal/privacy-policy')} hitSlop={8}>
                <Text variant="caption" style={{ textDecorationLine: 'underline' }} color="textSecondary">
                  Gizlilik Politikası
                </Text>
              </Pressable>
            </Row>
          </Stack>
        </>
      )}
    </SafeAreaView>
  );
}

function ComparisonTable({ planLimits, selectedPlan }: { planLimits: PlanLimits[]; selectedPlan: PlanCode | null }) {
  const theme = useTheme();
  // Sütun sırası plan_limits'in kota sırasıdır (Ücretsiz, Plus, İşletme).
  const columns = planLimits.map((limits) => limits.plan as PlanCode);

  return (
    <View>
      <Row align="center" style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs }}>
        <View style={{ flex: TABLE_LABEL_WIDTH_FLEX }} />
        {columns.map((plan) => (
          <View
            key={plan}
            style={{ width: TABLE_COLUMN_WIDTH, alignItems: 'center', paddingVertical: 2 }}
          >
            <Text
              variant="caption"
              numberOfLines={1}
              style={{
                fontWeight: plan === selectedPlan ? '700' : '500',
                color: plan === selectedPlan ? theme.colors.brandPrimary : theme.colors.textSecondary,
              }}
            >
              {PLAN_SHORT_LABELS[plan]}
            </Text>
          </View>
        ))}
      </Row>
      {COMPARISON_ROWS.map((row) => (
        <View key={row.label}>
          <Divider />
          <Row align="center" style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs }}>
            <Text variant="caption" style={{ flex: TABLE_LABEL_WIDTH_FLEX }}>
              {row.label}
            </Text>
            {planLimits.map((limits) => {
              const selected = limits.plan === selectedPlan;
              const value = row.value(limits);
              return (
                <View
                  key={limits.plan}
                  style={{
                    width: TABLE_COLUMN_WIDTH,
                    alignItems: 'center',
                    paddingVertical: 4,
                    borderRadius: 8,
                    backgroundColor: selected ? withAlpha(theme.colors.brandPrimary, 0.1) : 'transparent',
                  }}
                >
                  <Text
                    variant="caption"
                    tabular
                    style={{
                      fontWeight: selected ? '700' : '400',
                      color:
                        value === '—'
                          ? theme.colors.textSecondary
                          : selected
                            ? theme.colors.brandPrimary
                            : theme.colors.textPrimary,
                    }}
                  >
                    {value}
                  </Text>
                </View>
              );
            })}
          </Row>
        </View>
      ))}
    </View>
  );
}
