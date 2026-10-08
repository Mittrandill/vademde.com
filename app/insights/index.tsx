import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, EmptyState, Pressable, ScrollableTabs, Skeleton, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { AiGate } from '@/components/finance/AiGate';
import { HeroAmount } from '@/components/finance/HeroAmount';
import {
  INSIGHT_KIND_LABEL,
  dismissInsight,
  generateInsights,
  listInsights,
  type AiInsight,
  type InsightKind,
} from '@/features/insights/api';
import { AI_DISCLAIMER, useAiAccess } from '@/features/insights/useAiAccess';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';

type TabKey = 'all' | InsightKind;

// design AiOneriler.html. Öneriler generate-insights edge function'ında deterministik
// kurallardan üretilir (rakamlar sorgudan); bu ekran yalnızca listeler ve yönlendirir.
export default function InsightsScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          gap: theme.spacing.lg,
          paddingBottom: theme.spacing.massive,
        }}
      >
        <ScreenHeader title="Akıllı öneriler" />
        <AiGate>
          <InsightsContent />
        </AiGate>
      </ScrollView>
    </SafeAreaView>
  );
}

function InsightsContent() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { consentGranted, isPlus } = useAiAccess();
  const [tab, setTab] = useState<TabKey>('all');

  const insightsQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'ai-insights'] : ['ai-insights', 'disabled'],
    queryFn: () => listInsights(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const refreshMutation = useMutation({
    mutationFn: () => generateInsights(activeWorkspaceId as string),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'ai-insights'] }),
  });

  // Ekran açıldığında bir kez yeni öneri üretmeyi dene (kurallar aynı olgu için tekrar üretmez).
  const { mutate: refresh } = refreshMutation;
  useEffect(() => {
    if (activeWorkspaceId && consentGranted && isPlus) refresh();
  }, [activeWorkspaceId, consentGranted, isPlus, refresh]);

  const dismissMutation = useMutation({
    mutationFn: dismissInsight,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'ai-insights'] }),
  });

  const insights = useMemo(() => insightsQuery.data ?? [], [insightsQuery.data]);
  // Nakit önerilerindeki negatif etki bir açık uyarısıdır, tasarruf değil; toplama girmez.
  const savingMinor = insights.reduce(
    (s, i) => s + (i.kind !== 'nakit' && i.impact_minor && i.impact_minor < 0 ? -i.impact_minor : 0),
    0
  );

  const tabs = useMemo(() => {
    const kinds = Array.from(new Set(insights.map((i) => i.kind)));
    return [
      { key: 'all', label: `Tümü · ${insights.length}` },
      ...kinds.map((k) => ({ key: k, label: INSIGHT_KIND_LABEL[k] })),
    ];
  }, [insights]);
  const visible = tab === 'all' ? insights : insights.filter((i) => i.kind === tab);

  return (
    <Stack gap="lg">
      {savingMinor > 0 ? (
        <View
          style={{
            gap: theme.spacing.xs,
            padding: theme.spacing.lg,
            borderRadius: theme.radius.widget,
            backgroundColor: theme.colors.surfacePrimary,
          }}
        >
          <Text variant="body" color="textSecondary" style={{ fontWeight: '500' }}>
            Tasarruf potansiyeli
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.xs }}>
            <HeroAmount amountMinor={savingMinor} baseSize={44} color="receivable" />
            <Text variant="caption" color="textSecondary">
              / ay
            </Text>
          </View>
          <Text variant="caption" color="textSecondary">
            Kayıtlarından çıkarıldı. Hiçbir şey sen onaylamadan değişmez.
          </Text>
        </View>
      ) : null}

      {insights.length > 0 ? (
        <ScrollableTabs tabs={tabs} activeKey={tab} onChange={(k) => setTab(k as TabKey)} />
      ) : null}

      {insightsQuery.isLoading ? (
        <Stack gap="sm">
          <Skeleton height={150} borderRadius={theme.radius.widget} />
          <Skeleton height={150} borderRadius={theme.radius.widget} />
        </Stack>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="sparkles-outline"
          title={refreshMutation.isPending ? 'Kayıtların inceleniyor' : 'Şimdilik öneri yok'}
          message="Yeterli kayıt biriktikçe tekrarlayan abonelikler ve artan harcamalar burada görünür."
        />
      ) : (
        visible.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            onDismiss={() => dismissMutation.mutate(insight.id)}
          />
        ))
      )}

      <Button label="Bir şey sor" variant="secondary" icon="chatbubble-ellipses-outline" onPress={() => router.push('/insights/ask')} />

      <Text variant="caption" color="textSecondary">
        {AI_DISCLAIMER}
      </Text>
    </Stack>
  );
}

function InsightCard({ insight, onDismiss }: { insight: AiInsight; onDismiss: () => void }) {
  const theme = useTheme();
  const impact = insight.impact_minor;

  return (
    <View
      style={{
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radius.widget,
        backgroundColor: theme.colors.surfacePrimary,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.xs }}>
        <Text variant="label" style={{ color: theme.colors.payable }}>
          {INSIGHT_KIND_LABEL[insight.kind]}
        </Text>
        {impact ? (
          <Text
            variant="label"
            tabular
            style={{
              textTransform: 'none',
              color: insight.kind === 'nakit' ? theme.colors.danger : impact < 0 ? theme.colors.receivable : theme.colors.textPrimary,
            }}
          >
            {impact < 0 ? '−' : '+'}
            {formatMinorAmount(Math.abs(impact)).replace(/,00$/, '')}
            {insight.kind === 'nakit' ? ' açık' : '/ay'}
          </Text>
        ) : null}
      </View>
      <Text variant="cardTitle" style={{ fontSize: 18 }}>
        {insight.title}
      </Text>
      <Text variant="body" color="textSecondary">
        {insight.body}
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'center' }}>
        {insight.action_route ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(insight.action_route as Href)}
            style={{
              minHeight: theme.touchTarget.minimum,
              paddingHorizontal: theme.spacing.md,
              borderRadius: 12,
              justifyContent: 'center',
              backgroundColor: theme.colors.fill,
            }}
          >
            <Text variant="cardTitle" style={{ fontSize: 14 }}>
              İncele
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bu öneriyi gizle"
          onPress={onDismiss}
          style={{ minHeight: theme.touchTarget.minimum, paddingHorizontal: theme.spacing.sm, justifyContent: 'center' }}
        >
          <Text variant="cardTitle" color="textSecondary" style={{ fontSize: 14 }}>
            Gizle
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
