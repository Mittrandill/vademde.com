import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Pressable, Text } from '@/components/primitives';
import { listInsights } from '@/features/insights/api';
import { useAiAccess } from '@/features/insights/useAiAccess';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';

// Ana sayfa özet kartı (design Main.html "tasarruf önerisi"): yalnızca Plus + onay verilmişse
// ve bekleyen öneri varsa görünür; aksi halde hiçbir şey çizmez (ücretsiz kullanıcıya baskı yok).
export function AiInsightsCard() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { ready, isPlus, consentGranted } = useAiAccess();
  const enabled = ready && isPlus && consentGranted && !!activeWorkspaceId;

  const query = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'ai-insights'] : ['ai-insights', 'disabled'],
    queryFn: () => listInsights(activeWorkspaceId as string),
    enabled,
  });

  const insights = query.data ?? [];
  if (!enabled || insights.length === 0) return null;
  const savingMinor = insights.reduce((s, i) => s + (i.impact_minor && i.impact_minor < 0 ? -i.impact_minor : 0), 0);

  const top = insights[0];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/insights')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        borderRadius: theme.radius.widget,
        backgroundColor: theme.colors.surfacePrimary,
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(107,77,255,0.16)' }}>
        <Ionicons name="sparkles" size={22} color={theme.colors.payable} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" color="textSecondary">
          {insights.length} öneri
        </Text>
        <Text style={{ fontWeight: '600', fontSize: 17, lineHeight: 22 }} tabular numberOfLines={1}>
          {savingMinor > 0 ? `Ayda ${formatMinorAmount(savingMinor).replace(/,00$/, '')} tasarruf` : top?.title}
        </Text>
        {savingMinor > 0 && top ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {top.title}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedControl} />
    </Pressable>
  );
}
