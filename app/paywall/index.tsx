import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Animated, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { withAlpha } from '@/theme/colors';
import { Button, Card, Divider, Pressable, Row, SectionHeader, SegmentedControl, Stack, Text } from '@/components/primitives';
import {
  currentPeriodMonth,
  getAllPlanLimits,
  getCurrentOcrUsage,
  getMySubscription,
  type PlanCode,
  type PlanLimits,
} from '@/features/subscriptions/api';
import { getOfferings, purchasePackage, restorePurchases } from '@/services/purchases';
import { queryKeys } from '@/services/queryKeys';

type BillingPeriod = 'monthly' | 'yearly';

const PLAN_LABELS: Record<PlanCode, string> = {
  free: 'Ücretsiz',
  plus: 'Vademde Plus',
  isletme: 'Vademde İşletme',
};

// Merdivendeki dar etiket sütunu için kısa ad.
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

// Merdivende ücretsiz planın çubuğu (20 belge) İşletme'nin yanında görünmez olurdu;
// oran doğru kalsın diye ölçek doğrusal tutulur, yalnızca alt sınır uygulanır.
const MIN_BAR_RATIO = 0.04;

// docs/10-abonelik-gelir-modeli.md — özellik listesi plan_limits alanlarından türetilir.
// Etiketler kullanıcının tanıdığı adlarla yazılır (ör. "audit log" değil, "değişiklik günlüğü").
function buildFeatures(limits: PlanLimits): string[] {
  const features: string[] = [`Ayda ${limits.monthly_ocr_quota} belge okuma`];
  features.push(
    limits.max_personal_workspaces > 1
      ? `${limits.max_personal_workspaces} çalışma alanı`
      : '1 kişisel çalışma alanı'
  );
  if (limits.max_team_members) features.push(`${limits.max_team_members} ekip üyesi`);
  if (limits.advanced_reports) features.push('Gelişmiş raporlar');
  if (limits.document_archive) features.push('Belge arşivi');
  if (limits.recurring_transactions) features.push('Düzenli işlemler');
  if (limits.unlimited_export) features.push('Sınırsız dışa aktarma');
  if (limits.face_id) features.push('Face ID kilidi');
  if (limits.audit_log) features.push('Değişiklik günlüğü');
  return features;
}

function formatPrice(value: number, currencyCode: string): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(value);
}

// Yıllık planın aylık plana göre kazancı; ikisi de mağazadan gelmediyse gösterilmez.
function yearlySavingPercent(offering: PurchasesOffering | undefined): number | null {
  const monthly = offering?.monthly?.product.price;
  const annual = offering?.annual?.product.price;
  if (!monthly || !annual) return null;
  const percent = Math.round((1 - annual / (monthly * 12)) * 100);
  return percent > 0 ? percent : null;
}

// docs/08-tasarim-sistemi.md §12.19 — hareket bilgi taşımaz, destekler; sistem
// ayarında hareket azaltma açıksa çubuklar animasyonsuz son haliyle çizilir.
function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
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

  const selectedLimits = paidPlans.find((limits) => limits.plan === selectedPlan);
  const maxQuota = planLimits.reduce((max, limits) => Math.max(max, limits.monthly_ocr_quota), 0);

  function resolvePackage(plan: PlanCode): PurchasesPackage | null {
    if (plan === 'free') return null;
    const offering = offeringsQuery.data?.all[plan];
    if (!offering) return null;
    return billingPeriod === 'yearly' ? offering.annual : offering.monthly;
  }

  const selectedPackage = selectedPlan ? resolvePackage(selectedPlan) : null;
  const savingPercent = selectedPlan ? yearlySavingPercent(offeringsQuery.data?.all[selectedPlan]) : null;
  const isCurrentSelected = selectedPlan === currentPlan;

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
      Alert.alert('Satın alımlar geri yüklendi');
      router.back();
    } catch (err) {
      Alert.alert('Geri yükleme başarısız', err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsRestoring(false);
    }
  }

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
              gap: theme.spacing.xl,
            }}
          >
            <Stack gap="sm">
              <Text variant="pageTitle">
                Ayda{' '}
                <Text variant="pageTitle" tabular style={{ color: theme.colors.brandPrimary }}>
                  {selectedLimits?.monthly_ocr_quota ?? '—'}
                </Text>{' '}
                belge tarayın,{'\n'}vadeleri Vademde hatırlatsın.
              </Text>
              <Text variant="body" color="textSecondary">
                {PLAN_STATUS_LABELS[currentPlan] ?? PLAN_STATUS_LABELS.free}
                {ocrUsageQuery.data
                  ? ` · bu ay ${ocrUsageQuery.data.usedCount}/${ocrUsageQuery.data.quota} belge okundu`
                  : ''}
              </Text>
            </Stack>

            <Stack gap="sm">
              <SectionHeader title="Aylık belge kapasitesi" />
              <Card>
                <Stack gap="md">
                  {planLimits.map((limits, index) => (
                    <QuotaRow
                      key={limits.plan}
                      label={PLAN_SHORT_LABELS[limits.plan as PlanCode] ?? limits.plan}
                      quota={limits.monthly_ocr_quota}
                      ratio={maxQuota > 0 ? Math.max(limits.monthly_ocr_quota / maxQuota, MIN_BAR_RATIO) : 0}
                      highlighted={limits.plan === selectedPlan}
                      delay={index * 80}
                    />
                  ))}
                </Stack>
              </Card>
            </Stack>

            <Stack gap="sm">
              <SegmentedControl
                stretch
                options={[
                  { key: 'monthly', label: 'Aylık' },
                  { key: 'yearly', label: 'Yıllık' },
                ]}
                value={billingPeriod}
                onChange={setBillingPeriod}
              />
              {savingPercent ? (
                <Text variant="caption" color="textSecondary">
                  Yıllık ödemede %{savingPercent} daha az ödersiniz.
                </Text>
              ) : null}
            </Stack>

            <Stack gap="sm">
              {paidPlans.map((limits) => {
                const plan = limits.plan as PlanCode;
                return (
                  <PlanOption
                    key={plan}
                    plan={plan}
                    limits={limits}
                    pkg={resolvePackage(plan)}
                    billingPeriod={billingPeriod}
                    selected={plan === selectedPlan}
                    isCurrent={plan === currentPlan}
                    onSelect={() => setChosenPlan(plan)}
                  />
                );
              })}
            </Stack>

            {selectedLimits ? (
              <Stack gap="sm">
                <SectionHeader title={`${PLAN_SHORT_LABELS[selectedPlan as PlanCode]} planında`} />
                <Card>
                  <Stack gap="sm">
                    {buildFeatures(selectedLimits).map((feature) => (
                      <Row key={feature} gap="sm">
                        <Ionicons name="checkmark" size={18} color={theme.colors.success} />
                        <Text variant="body" style={{ flex: 1 }}>
                          {feature}
                        </Text>
                      </Row>
                    ))}
                  </Stack>
                </Card>
              </Stack>
            ) : null}
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
                    ? `${PLAN_CTA_LABELS[selectedPlan as PlanCode]} · ${selectedPackage.product.priceString}`
                    : PLAN_CTA_LABELS[selectedPlan as PlanCode] ?? 'Planı seçin'
              }
              onPress={handlePurchase}
              loading={purchasingPlan !== null}
              disabled={!selectedPackage || isCurrentSelected || purchasingPlan !== null}
            />
            <Text variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>
              {!selectedPackage && !isCurrentSelected
                ? 'Mağaza fiyatları şu anda alınamıyor.'
                : Platform.OS === 'android'
                  ? 'Google Play üzerinden faturalanır. İstediğiniz zaman iptal edebilirsiniz.'
                  : 'App Store üzerinden faturalanır. İstediğiniz zaman iptal edebilirsiniz.'}
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

interface QuotaRowProps {
  label: string;
  quota: number;
  ratio: number;
  highlighted: boolean;
  delay: number;
}

// Ekranın imzası: planlar arasındaki fark, uygulamanın kendi biriminde (ayda okunan
// belge) gerçek plan_limits verisinden çizilir. Seçili plan Saffron'a döner; ekranda
// tek vurgu rengi kalır (docs/08-tasarim-sistemi.md §12.4).
function QuotaRow({ label, quota, ratio, highlighted, delay }: QuotaRowProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [grow] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) {
      grow.setValue(1);
      return undefined;
    }
    const animation = Animated.timing(grow, {
      toValue: 1,
      duration: theme.motion.chartEntryMs,
      delay,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [grow, reduceMotion, delay, theme.motion.chartEntryMs]);

  return (
    <Row gap="sm">
      <Text
        variant="caption"
        color={highlighted ? 'textPrimary' : 'textSecondary'}
        numberOfLines={1}
        style={{ width: 62, fontWeight: highlighted ? '600' : '400' }}
      >
        {label}
      </Text>
      <View
        style={{
          flex: 1,
          height: 10,
          borderRadius: 999,
          backgroundColor: theme.colors.backgroundPrimary,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            height: '100%',
            borderRadius: 999,
            backgroundColor: highlighted
              ? theme.colors.brandPrimary
              : withAlpha(theme.colors.textSecondary, 0.35),
            width: grow.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', `${Math.round(ratio * 100)}%`],
            }),
          }}
        />
      </View>
      <Text
        variant="cardTitle"
        tabular
        color={highlighted ? 'textPrimary' : 'textSecondary'}
        style={{ minWidth: 52, textAlign: 'right' }}
      >
        {quota}
      </Text>
    </Row>
  );
}

interface PlanOptionProps {
  plan: PlanCode;
  limits: PlanLimits;
  pkg: PurchasesPackage | null;
  billingPeriod: BillingPeriod;
  selected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
}

function PlanOption({ plan, limits, pkg, billingPeriod, selected, isCurrent, onSelect }: PlanOptionProps) {
  const theme = useTheme();
  const product = pkg?.product;
  const monthlyEquivalent =
    billingPeriod === 'yearly' && product ? formatPrice(product.price / 12, product.currencyCode) : null;

  // Kart özeti: kapasite dışındaki en ayırt edici iki alan.
  const summary = [
    limits.max_team_members ? `${limits.max_team_members} ekip üyesi` : null,
    limits.max_personal_workspaces > 1 ? `${limits.max_personal_workspaces} çalışma alanı` : null,
    limits.advanced_reports ? 'Gelişmiş raporlar' : null,
  ]
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={PLAN_LABELS[plan]}
      onPress={onSelect}
    >
      <Card
        elevated={selected}
        style={{
          borderWidth: 1.5,
          borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        }}
      >
        <Row gap="sm">
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: 2,
              borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {selected ? (
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: theme.colors.brandPrimary,
                }}
              />
            ) : null}
          </View>

          <Stack gap="xxs" style={{ flex: 1 }}>
            <Row gap="xs">
              <Text variant="cardTitle">{PLAN_LABELS[plan]}</Text>
              {isCurrent ? (
                <View
                  style={{
                    paddingHorizontal: theme.spacing.xs,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: withAlpha(theme.colors.success, 0.16),
                  }}
                >
                  <Text variant="caption" style={{ color: theme.colors.success, fontWeight: '600' }}>
                    Mevcut
                  </Text>
                </View>
              ) : null}
            </Row>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {summary || `Ayda ${limits.monthly_ocr_quota} belge`}
            </Text>
          </Stack>

          <Stack gap="xxs" align="flex-end">
            <Text variant="cardTitle" tabular>
              {product?.priceString ?? '—'}
            </Text>
            <Text variant="caption" color="textSecondary" tabular>
              {monthlyEquivalent ? `ayda ${monthlyEquivalent}` : billingPeriod === 'yearly' ? 'yıllık' : 'aylık'}
            </Text>
          </Stack>
        </Row>
      </Card>
    </Pressable>
  );
}
