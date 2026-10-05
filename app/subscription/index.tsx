import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, Pressable, Row, Stack, Text } from '@/components/primitives';
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
      // Plan değişince çalışma alanı/ekip limitleri de değişir; kilit anında kalkmalı.
      await queryClient.invalidateQueries({ queryKey: queryKeys.planEnforcement() });
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
        <Stack gap="xs">
          <Text variant="label" color="textSecondary">
            Mevcut plan
          </Text>
          <Text variant="displayAmount" numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: undefined, fontSize: 36 }}>
            {planLabel}
          </Text>
          <Text variant="caption" color="textSecondary">
            {renewalLine ?? (isFree ? "Kota her ayın 1'inde yenilenir" : 'Aktif üyelik')}
          </Text>
        </Stack>

        <Stack gap="xs">
          <Text variant="label" color="textSecondary">
            Bu ay kullanım
          </Text>
          <View style={{ gap: theme.spacing.xs, paddingVertical: theme.spacing.xs }}>
            <Row align="center" style={{ justifyContent: 'space-between' }}>
              <Text variant="cardTitle">Belge tarama</Text>
              <Text variant="cardTitle" tabular>
                {usage ? `${usage.usedCount} / ${usage.quota}` : '—'}
              </Text>
            </Row>
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(usageRatio * 100) }}
              style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.border, overflow: 'hidden' }}
            >
              <View
                style={{
                  width: `${Math.round(usageRatio * 100)}%`,
                  height: '100%',
                  borderRadius: 4,
                  backgroundColor: usageRatio >= 1 ? theme.colors.danger : theme.colors.textPrimary,
                }}
              />
            </View>
          </View>
        </Stack>

        <Button
          icon={isFree ? 'arrow-up-circle-outline' : 'swap-horizontal-outline'}
          label={isFree ? "Plus'a geç" : 'Planı değiştir'}
          onPress={() => router.push('/paywall')}
        />

        {features.length > 0 ? (
          <Stack gap="xs">
            <Text variant="label" color="textSecondary">
              {planLabel} planında
            </Text>
            {features.map((feature) => (
              <Row key={feature} gap="sm" style={{ minHeight: 40 }}>
                <Ionicons name="checkmark" size={18} color={theme.colors.receivable} />
                <Text variant="body" style={{ flex: 1 }}>
                  {feature}
                </Text>
              </Row>
            ))}
          </Stack>
        ) : null}

        <View style={{ borderRadius: theme.radius.widget, backgroundColor: theme.colors.surfacePrimary, overflow: 'hidden' }}>
          <Pressable
            accessibilityRole="button"
            onPress={handleRestore}
            disabled={isRestoring}
            style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md }}
          >
            <Ionicons name="refresh-outline" size={22} color={theme.colors.textPrimary} />
            <Text variant="cardTitle" style={{ flex: 1 }}>
              Satın alımları geri yükle
            </Text>
            {isRestoring ? (
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : (
              <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedControl} />
            )}
          </Pressable>
          <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: theme.spacing.md + 22 + theme.spacing.sm }} />
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => {})}
            style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md }}
          >
            <Ionicons name="storefront-outline" size={22} color={theme.colors.textPrimary} />
            <Text variant="cardTitle" style={{ flex: 1 }}>
              Aboneliği mağazada yönet
            </Text>
            <Text variant="caption" color="textSecondary">
              App Store
            </Text>
          </Pressable>
        </View>

        <Text variant="caption" color="textSecondary">
          Ödemeler App Store veya Google Play üzerinden alınır; iptal de oradan yapılır.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
