import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, Card, GroupedRow, GroupedSection, Row, Stack, Text } from '@/components/primitives';
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
import { friendlyErrorMessage } from '@/utils/alerts';

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
      Alert.alert('Geri yükleme başarısız', friendlyErrorMessage(err, 'Bir hata oluştu'));
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
        <Card style={{ gap: 12 }}>
          <Row align="center" style={{ justifyContent: 'space-between' }}>
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="caption" color="textSecondary">
                Mevcut plan
              </Text>
              <Text variant="sectionTitle" numberOfLines={1}>
                {planLabel}
              </Text>
            </Stack>
            <Button label={isFree ? 'Planları gör' : 'Planı değiştir'} size="sm" onPress={() => router.push('/paywall')} />
          </Row>
          <View style={{ height: 1, backgroundColor: theme.colors.separator }} />
          <Stack gap="xs">
            <Row align="center" style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 15 }}>Bu ayki belge tarama</Text>
              <Text tabular style={{ fontSize: 15, fontWeight: '600' }}>
                {usage ? `${usage.usedCount} / ${usage.quota}` : '—'}
              </Text>
            </Row>
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(usageRatio * 100) }}
              style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.fill, overflow: 'hidden' }}
            >
              <View
                style={{
                  width: `${Math.round(usageRatio * 100)}%`,
                  height: '100%',
                  borderRadius: 3,
                  backgroundColor: usageRatio >= 1 ? theme.colors.danger : theme.colors.brandPrimary,
                }}
              />
            </View>
            <Text variant="caption" color="textSecondary">
              {renewalLine ?? (isFree ? "Kota her ayın 1'inde yenilenir. Okunamayan belgeler kotadan düşmez." : 'Aktif üyelik')}
            </Text>
          </Stack>
        </Card>

        {features.length > 0 ? (
          <GroupedSection title={`${planLabel} planında`}>
            {features.map((feature) => (
              <GroupedRow key={feature} title={feature} chevron={false} trailing={<Ionicons name="checkmark" size={18} color={theme.colors.success} />} />
            ))}
          </GroupedSection>
        ) : null}

        <GroupedSection title="Satın alma">
          <GroupedRow
            title="Satın alımları geri yükle"
            chevron={false}
            trailing={isRestoring ? <ActivityIndicator size="small" color={theme.colors.textSecondary} /> : undefined}
            onPress={handleRestore}
            disabled={isRestoring}
          />
          <GroupedRow
            title="Aboneliği mağazada yönet"
            value="App Store"
            onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => {})}
          />
        </GroupedSection>

        <Text variant="caption" color="textSecondary" style={{ paddingHorizontal: theme.spacing.xxs }}>
          Ödemeler App Store veya Google Play üzerinden alınır; iptal de oradan yapılır.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
