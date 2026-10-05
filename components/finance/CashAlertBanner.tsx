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
        padding: theme.spacing.md,
        borderRadius: theme.radius.widget,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: theme.colors.attentionMarker,
      }}
    >
      <Ionicons name="trending-down-outline" size={22} color={theme.colors.attentionMarker} />
      <View style={{ flex: 1 }}>
        <Text variant="cardTitle">
          {risky.name} {dayMonth.format(new Date(risky.forecast.firstNegative.date))} tarihinde eksiye düşebilir
        </Text>
        <Text variant="caption" color="textSecondary">
          Ayrıntıyı ve çözüm önerilerini gör
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedControl} />
    </Pressable>
  );
}
