import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Pressable, Text } from '@/components/primitives';
import { atRiskAccounts, useCashForecasts } from '@/features/cashflow/useCashForecasts';
import { listInsights } from '@/features/insights/api';
import { useAiAccess } from '@/features/insights/useAiAccess';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { CashArt, OverdueArt, SparkleArt } from './HomeArt';

const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
const MASK = '••••••';

interface AlertCardProps {
  id: string;
  width: number;
  tone: string;
  eyebrow: string;
  headline: string;
  /** true: headline büyük tutar; false: başlık metni. */
  headlineIsAmount?: boolean;
  body: string;
  cta: string;
  art: ReactNode;
  onPress: () => void;
}

// Tuval dışı (kullanıcı görseli): degrade zeminli, sağda illüstrasyonlu uyarı kartı.
function AlertCard({ id, width, tone, eyebrow, headline, headlineIsAmount, body, cta, art, onPress }: AlertCardProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}. ${headline}`}
      onPress={onPress}
      style={{
        width,
        minHeight: 168,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfacePrimary,
        borderWidth: 1,
        borderColor: withAlpha(tone, 0.32),
      }}
    >
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={tone} stopOpacity={0.3} />
            <Stop offset="1" stopColor={tone} stopOpacity={0.05} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      <View pointerEvents="none" style={{ position: 'absolute', right: -14, bottom: -10, opacity: 0.95 }}>
        {art}
      </View>
      <View style={{ padding: 18, paddingRight: 120, gap: 4, flex: 1 }}>
        <Text color="textSecondary" style={{ fontSize: 13, fontWeight: '500' }}>
          {eyebrow}
        </Text>
        {headlineIsAmount ? (
          <Text variant="displayAmount" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 28, lineHeight: 34, color: tone }}>
            {headline}
          </Text>
        ) : (
          <Text numberOfLines={3} style={{ fontSize: 18, fontWeight: '700', lineHeight: 23 }}>
            {headline}
          </Text>
        )}
        <Text variant="caption" color="textSecondary" numberOfLines={3}>
          {body}
        </Text>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <Text style={{ color: tone, fontWeight: '600', fontSize: 15 }}>{cta}</Text>
          <Ionicons name="arrow-forward" size={15} color={tone} />
        </View>
      </View>
      <View
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withAlpha('#000000', 0.35),
        }}
      >
        <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

export interface HomeAlertCarouselProps {
  overdueMinor: number;
  overdueCount: number;
  hidden: boolean;
}

// Ana sayfada Hızlı işlemlerin üstünde yatay kaydırmalı uyarı kartları: Gecikmiş, Nakit uyarısı,
// Akıllı öneri. Hiçbiri geçerli değilse hiçbir şey çizilmez.
export function HomeAlertCarousel({ overdueMinor, overdueCount, hidden }: HomeAlertCarouselProps) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const edge = theme.screenEdge.standard;
  const gap = 12;
  const cardWidth = Math.min(screenWidth - edge * 2 - 28, 420);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const { forecasts } = useCashForecasts(activeWorkspaceId);
  const risky = atRiskAccounts(forecasts)[0];

  const { ready, isPlus, consentGranted } = useAiAccess();
  const aiEnabled = ready && isPlus && consentGranted && !!activeWorkspaceId;
  const insightsQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'ai-insights'] : ['ai-insights', 'disabled'],
    queryFn: () => listInsights(activeWorkspaceId as string),
    enabled: aiEnabled,
  });
  const insights = aiEnabled ? (insightsQuery.data ?? []) : [];

  const cards: ReactNode[] = [];

  if (overdueCount > 0) {
    cards.push(
      <AlertCard
        key="overdue"
        id="g-overdue"
        width={cardWidth}
        tone={theme.colors.danger}
        eyebrow={`Gecikmiş · ${overdueCount} kayıt`}
        headline={hidden ? MASK : formatMinorAmount(overdueMinor)}
        headlineIsAmount
        body={`Ödeme tarihi geçen ${overdueCount} kaydın var.`}
        cta="Hemen incele"
        art={<OverdueArt color={theme.colors.danger} />}
        onPress={() => router.push({ pathname: '/obligations', params: { status: 'overdue' } })}
      />
    );
  }

  const firstNegative = risky?.forecast.firstNegative;
  if (risky && firstNegative) {
    const date = dayMonth.format(new Date(firstNegative.date));
    cards.push(
      <AlertCard
        key="cash"
        id="g-cash"
        width={cardWidth}
        tone={theme.colors.attentionMarker}
        eyebrow="Nakit uyarısı"
        headline={`${risky.name} ${date} tarihinde eksiye düşebilir`}
        body="Vadelere göre tahmini bakiye eksiye inebilir."
        cta="Detayları gör"
        art={<CashArt color={theme.colors.attentionMarker} />}
        onPress={() => router.push(`/cash-alert/${risky.accountId}`)}
      />
    );
  }

  if (insights.length > 0) {
    // Nakit önerilerindeki negatif etki bir açık uyarısıdır, tasarruf değil; toplama girmez.
    const savingMinor = insights.reduce(
      (s, i) => s + (i.kind !== 'nakit' && i.impact_minor && i.impact_minor < 0 ? -i.impact_minor : 0),
      0
    );
    const top = insights[0];
    cards.push(
      <AlertCard
        key="ai"
        id="g-ai"
        width={cardWidth}
        tone={theme.colors.payable}
        eyebrow={`${insights.length} akıllı öneri`}
        headline={savingMinor > 0 ? `Ayda ${formatMinorAmount(savingMinor).replace(/,00$/, '')} tasarruf` : (top?.title ?? 'Öneriler hazır')}
        body={savingMinor > 0 && top ? top.title : 'Harcamalarına göre hazırlandı.'}
        cta="Önerileri gör"
        art={<SparkleArt color={theme.colors.payable} />}
        onPress={() => router.push('/insights')}
      />
    );
  }

  if (cards.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={cardWidth + gap}
      snapToAlignment="start"
      style={{ marginHorizontal: -edge }}
      contentContainerStyle={{ paddingHorizontal: edge, gap }}
    >
      {cards}
    </ScrollView>
  );
}
