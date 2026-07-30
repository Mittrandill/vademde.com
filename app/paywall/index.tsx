import { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PurchasesPackage } from 'react-native-purchases';

import { useTheme } from '@/theme';
import { Button, Card, Pressable, Row, SegmentedControl, Stack, Text } from '@/components/primitives';
import { getAllPlanLimits, type PlanCode, type PlanLimits } from '@/features/subscriptions/api';
import { getOfferings, purchasePackage, restorePurchases } from '@/services/purchases';
import { queryKeys } from '@/services/queryKeys';

type BillingPeriod = 'monthly' | 'yearly';

const PLAN_LABELS: Record<PlanCode, string> = {
  free: 'Ücretsiz',
  plus: 'Vademde Plus',
  isletme: 'Vademde İşletme',
};

// docs/10-abonelik-gelir-modeli.md — plan_limits alanlarından özellik listesi türetilir.
function buildFeatures(limits: PlanLimits): string[] {
  const features: string[] = [`Ayda ${limits.monthly_ocr_quota} belge OCR`];
  features.push(
    limits.max_personal_workspaces > 1
      ? `${limits.max_personal_workspaces} çalışma alanına kadar`
      : '1 kişisel çalışma alanı'
  );
  if (limits.advanced_reports) features.push('Gelişmiş raporlar');
  if (limits.unlimited_export) features.push('Sınırsız dışa aktarma');
  if (limits.document_archive) features.push('Belge arşivi');
  if (limits.recurring_transactions) features.push('Düzenli işlemler');
  if (limits.face_id) features.push('Face ID kilidi');
  if (limits.audit_log) features.push('Audit log');
  if (limits.max_team_members) features.push(`${limits.max_team_members} ekip üyesine kadar`);
  return features;
}

export default function PaywallScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
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

  function resolvePackage(plan: PlanCode): PurchasesPackage | null {
    if (plan === 'free') return null;
    const offering = offeringsQuery.data?.all[plan];
    if (!offering) return null;
    return billingPeriod === 'yearly' ? offering.annual : offering.monthly;
  }

  async function handlePurchase(plan: PlanCode) {
    const pkg = resolvePackage(plan);
    if (!pkg) {
      Alert.alert('Plan şu anda satın alınamıyor', 'Lütfen daha sonra tekrar deneyin.');
      return;
    }
    setPurchasingPlan(plan);
    try {
      await purchasePackage(pkg);
      await queryClient.invalidateQueries({ queryKey: queryKeys.subscription() });
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
      Alert.alert('Satın alımlar geri yüklendi');
      router.back();
    } catch (err) {
      Alert.alert('Geri yükleme başarısız', err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Row
        align="center"
        gap="sm"
        style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text variant="pageTitle">Ayrıcalıkları Keşfet</Text>
      </Row>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <SegmentedControl
          options={[
            { key: 'monthly', label: 'Aylık' },
            { key: 'yearly', label: 'Yıllık' },
          ]}
          value={billingPeriod}
          onChange={setBillingPeriod}
        />

        {(planLimitsQuery.data ?? []).map((limits) => {
          const plan = limits.plan as PlanCode;
          const isFree = plan === 'free';
          const pkg = resolvePackage(plan);
          return (
            <Card key={plan} elevated={!isFree}>
              <Stack gap="sm">
                <Text variant="cardTitle">{PLAN_LABELS[plan] ?? plan}</Text>
                <Stack gap="xxs">
                  {buildFeatures(limits).map((feature) => (
                    <Row key={feature} gap="xs" align="center">
                      <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                      <Text variant="body" color="textSecondary">
                        {feature}
                      </Text>
                    </Row>
                  ))}
                </Stack>
                {!isFree ? (
                  <Button
                    label={pkg?.product.priceString ? `${pkg.product.priceString} — Satın Al` : 'Satın Al'}
                    onPress={() => handlePurchase(plan)}
                    loading={purchasingPlan === plan}
                    disabled={!pkg || purchasingPlan !== null}
                  />
                ) : null}
              </Stack>
            </Card>
          );
        })}

        <Button
          label="Satın Alımları Geri Yükle"
          variant="secondary"
          onPress={handleRestore}
          loading={isRestoring}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
