import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Pressable, Text } from '@/components/primitives';
import { atRiskAccounts, useCashForecasts } from '@/features/cashflow/useCashForecasts';
import { useWorkspaceStore } from '@/store/workspaceStore';

const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

// Ana sayfa: önümüzdeki 14 günde eksiye düşebilecek hesap varsa tek satırlık uyarı (en erkeni).
// Tahmin yalnızca vadelerden gelir; bu yüzden "düşebilir" dilidir.
export function CashAlertBanner() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { forecasts } = useCashForecasts(activeWorkspaceId);
  const risky = atRiskAccounts(forecasts)[0];
  if (!risky?.forecast.firstNegative) return null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/cash-alert/${risky.accountId}`)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        borderRadius: theme.radius.widget,
        backgroundColor: theme.colors.surfacePrimary,
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,176,0,0.16)' }}>
        <Ionicons name="trending-down" size={23} color={theme.colors.attentionMarker} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" color="textSecondary">
          Nakit uyarısı
        </Text>
        <Text style={{ fontWeight: '600', fontSize: 15, lineHeight: 20 }}>
          {risky.name} {dayMonth.format(new Date(risky.forecast.firstNegative.date))} tarihinde eksiye düşebilir
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedControl} />
    </Pressable>
  );
}
