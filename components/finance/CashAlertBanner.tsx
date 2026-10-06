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
        gap: 12,
        padding: 14,
        borderRadius: theme.radius.widget,
        backgroundColor: 'rgba(255,176,0,0.14)',
      }}
    >
      <Ionicons name="trending-down" size={22} color={theme.colors.attentionMarker} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', fontSize: 15 }}>
          {risky.name} {dayMonth.format(new Date(risky.forecast.firstNegative.date))} tarihinde eksiye düşebilir
        </Text>
        <Text variant="caption" color="textSecondary">
          Ayrıntıyı ve çözüm önerilerini gör
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
    </Pressable>
  );
}
