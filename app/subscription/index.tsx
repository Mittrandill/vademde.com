import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { withAlpha } from '@/theme/colors';
import { Button, Card, Divider, Pressable, Row, SectionHeader, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import {
  currentPeriodMonth,
  getCurrentOcrUsage,
  getMySubscription,
  getPlanLimits,
  type PlanCode,
} from '@/features/subscriptions/api';
import { restorePurchases } from '@/services/purchases';
import { queryKeys } from '@/services/queryKeys';

// docs/10-abonelik-gelir-modeli.md — plan kodu -> görünen ad (Ayarlar/paywall ile aynı eşleme).
const PLAN_LABELS: Record<PlanCode, string> = {
  free: 'Ücretsiz',
  plus: 'Vademde Plus',
  isletme: 'Vademde İşletme',
};

const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  grace_period: 'Ödeme sorunu — ödeme yönteminizi güncelleyin',
  expired: 'Süresi doldu',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR');
}

// docs/10-abonelik-gelir-modeli.md — mevcut plandaki özellik listesi paywall.tsx'teki
// buildFeatures ile aynı kaynaktan (plan_limits) türer; bu ekran karşılaştırma değil
// "şu an neredeyim" sorusuna cevap verdiği için kısa tutulur.
function buildFeatures(limits: { advanced_reports: boolean; document_archive: boolean; recurring_transactions: boolean; unlimited_export: boolean; face_id: boolean; audit_log: boolean; max_team_members: number | null; max_personal_workspaces: number }): string[] {
  const features: string[] = [];
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

// Ayarlar'daki eski "ABONELİK" kartının yerini alır — kendi ekranına taşınarak plan
// durumu, dönem kullanımı ve mevcut plandaki özellikler tek yerde toplanır; plan
// değiştirme/satın alma akışı hâlâ paywall'da kalır (docs/10-abonelik-gelir-modeli.md).
export default function SubscriptionScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const queryClient = useQueryClient();
  const [isRestoring, setIsRestoring] = useState(false);

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.subscription(),
    queryFn: getMySubscription,
  });

  const ocrUsageQuery = useQuery({
    queryKey: queryKeys.ocrUsage(currentPeriodMonth()),
    queryFn: getCurrentOcrUsage,
  });

  const planCode = (subscriptionQuery.data?.plan as PlanCode) ?? 'free';

  const planLimitsQuery = useQuery({
    queryKey: [...queryKeys.planLimits(), planCode],
    queryFn: () => getPlanLimits(planCode),
  });

  const planLabel = PLAN_LABELS[planCode] ?? planCode;
  const subscription = subscriptionQuery.data;
  const isFree = planCode === 'free';
  const renewalLine =
    subscription && !isFree
      ? SUBSCRIPTION_STATUS_LABEL[subscription.status] ??
        (subscription.current_period_end
          ? `${subscription.will_renew ? 'Sonraki yenileme' : 'Yenilenmeyecek — sona erme'}: ${formatDate(subscription.current_period_end)}${
              subscription.billing_period ? ` (${subscription.billing_period === 'yearly' ? 'yıllık' : 'aylık'})` : ''
            }`
          : null)
      : null;

  const usage = ocrUsageQuery.data;
  const usageRatio = usage && usage.quota > 0 ? Math.min(usage.usedCount / usage.quota, 1) : 0;
  const features = planLimitsQuery.data ? buildFeatures(planLimitsQuery.data) : [];

  async function handleRestore() {
    setIsRestoring(true);
    try {
      await restorePurchases();
      await queryClient.invalidateQueries({ queryKey: queryKeys.subscription() });
      Alert.alert('Satın alımlar geri yüklendi');
    } catch (err) {
      Alert.alert('Geri yükleme başarısız', err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader title="Abonelik" left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: () => router.back() }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <Card variant="hero">
          <Stack gap="lg">
            <Row gap="md" align="center">
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.4 }}>
                  MEVCUT PLAN
                </Text>
                <Text variant="displayAmount" numberOfLines={1} adjustsFontSizeToFit>
                  {planLabel}
                </Text>
              </Stack>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: theme.radius.input,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
                }}
              >
                <Ionicons name="sparkles-outline" size={24} color={theme.colors.brandPrimary} />
              </View>
            </Row>

            <Row align="center" gap="xs">
              <View
                style={{
                  paddingHorizontal: theme.spacing.xs,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: withAlpha(isFree ? theme.colors.textSecondary : theme.colors.success, 0.15),
                }}
              >
                <Text
                  variant="caption"
                  style={{
                    color: isFree ? theme.colors.textSecondary : theme.colors.success,
                    fontWeight: '600',
                  }}
                >
                  {isFree ? 'Aktif' : 'Aktif Üyelik'}
                </Text>
              </View>
              {renewalLine ? (
                <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
                  {renewalLine}
                </Text>
              ) : null}
            </Row>

            <Divider />

            <Stack gap="xs">
              <Row align="center" style={{ justifyContent: 'space-between' }}>
                <Text variant="caption" color="textSecondary">
                  BU AY OCR KULLANIMI
                </Text>
                <Text variant="caption" color="textSecondary" style={{ fontWeight: '600' }}>
                  {usage ? `${usage.usedCount}/${usage.quota}` : '—'}
                </Text>
              </Row>
              <View
                style={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${Math.round(usageRatio * 100)}%`,
                    height: '100%',
                    borderRadius: 4,
                    backgroundColor: theme.colors.brandPrimary,
                  }}
                />
              </View>
            </Stack>

            <Button
              icon={isFree ? 'arrow-up-circle-outline' : 'swap-horizontal-outline'}
              label={isFree ? 'Plan Yükselt' : 'Planı Değiştir'}
              onPress={() => router.push('/paywall')}
            />
          </Stack>
        </Card>

        {features.length > 0 ? (
          <Stack gap="sm">
            <SectionHeader title={`${planLabel} planında`} />
            <Card>
              <Stack gap="sm">
                {features.map((feature) => (
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

        <Pressable onPress={handleRestore} disabled={isRestoring}>
          <Row align="center" style={{ justifyContent: 'center', paddingVertical: theme.spacing.sm }} gap="xs">
            {isRestoring ? (
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : (
              <Text variant="body" color="textSecondary">
                Satın alımları geri yükle
              </Text>
            )}
          </Row>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
