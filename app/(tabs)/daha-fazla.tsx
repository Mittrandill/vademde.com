import { Children, Fragment, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Pressable, Row, Stack, Text } from '@/components/primitives';
import { listAccounts } from '@/features/accounts/api';
import { getObligationTotalsByType } from '@/features/obligations/api';
import { DOCUMENT_TYPE_ICON } from '@/features/obligations/documentTypes';
import { getMyProfile } from '@/features/profile/api';
import { currentPeriodMonth, getCurrentOcrUsage, getMySubscription } from '@/features/subscriptions/api';
import { useSession } from '@/features/auth/useSession';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';

// docs/10-abonelik-gelir-modeli.md — plan kodu -> görünen ad (Ayarlar ile aynı eşleme).
const PLAN_LABELS: Record<string, string> = {
  free: 'Ücretsiz',
  plus: 'Vademde Plus',
  isletme: 'Vademde İşletme',
};

function initialsFrom(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email?.trim() || '';
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toLocaleUpperCase('tr-TR');
  }
  return source.slice(0, 2).toLocaleUpperCase('tr-TR');
}

export default function MoreScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const { session } = useSession();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const profileQuery = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: getMyProfile,
  });

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.subscription(),
    queryFn: getMySubscription,
  });

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const totalsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.obligationTotalsByType(activeWorkspaceId)
      : ['obligation-type-totals', 'disabled'],
    queryFn: () => getObligationTotalsByType(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const ocrUsageQuery = useQuery({
    queryKey: queryKeys.ocrUsage(currentPeriodMonth()),
    queryFn: getCurrentOcrUsage,
  });
  const ocrUsage = ocrUsageQuery.data;

  const totalsByType = totalsQuery.data;
  const accounts = accountsQuery.data ?? [];
  const creditCardAccounts = accounts.filter((a) => a.type === 'credit_card');
  
  const email = session?.user?.email ?? null;
  const fullName = profileQuery.data?.full_name ?? null;
  const planCode = subscriptionQuery.data?.plan ?? 'free';
  const planLabel = PLAN_LABELS[planCode] ?? planCode;

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          // Kayan tab bar'ın altında kalmasın diye normalden fazla alt boşluk
          // (bkz. TabBar.tsx: mutlak konumlu, ~64+inset yükseklik).
          paddingBottom: theme.layout.tabBarClearance,
          gap: theme.spacing.lg,
        }}
      >
        <Text variant="pageTitle">Daha fazla</Text>

        {/* Profil: dokununca kendi Profil ekranına gider (More sekmesi = hesap girişi deseni). */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/profile')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            borderRadius: theme.radius.widget,
            backgroundColor: theme.colors.surfacePrimary,
          }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: theme.radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.backgroundPrimary,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text variant="cardTitle" mono>
              {initialsFrom(fullName, email)}
            </Text>
          </View>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Row gap="xs" align="center">
              <Text variant="cardTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
                {fullName || 'Profilini tamamla'}
              </Text>
              <PlanChip label={planLabel} />
            </Row>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {email ?? '—'}
            </Text>
          </Stack>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.mutedControl} />
        </Pressable>

        {/* Plan ve kalan OCR hakkı. Ücretsiz planda yükseltme çağrısı gösterilir. */}
        <View
          style={{
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            borderRadius: theme.radius.widget,
            backgroundColor: theme.colors.surfacePrimary,
          }}
        >
          <Row style={{ justifyContent: 'space-between' }}>
            <Stack gap="xxs">
              <Text variant="label" color="textSecondary">
                Plan
              </Text>
              <Text variant="cardTitle">{planLabel}</Text>
            </Stack>
            {planCode === 'free' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/paywall')}
                style={{
                  minHeight: theme.touchTarget.minimum,
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: 14,
                  justifyContent: 'center',
                  backgroundColor: theme.colors.action,
                }}
              >
                <Text variant="cardTitle" style={{ color: theme.colors.onAction }}>
                  Yükselt
                </Text>
              </Pressable>
            ) : null}
          </Row>
          {ocrUsage ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="caption" color="textSecondary">
                Kalan OCR hakkı
              </Text>
              <Text variant="label" tabular style={{ textTransform: 'none' }}>
                {ocrUsage.remaining} / {ocrUsage.quota}
              </Text>
            </Row>
          ) : null}
        </View>

        <MenuGroup title="Finans">
          <MenuRow icon="wallet-outline" label="Hesaplar" detail={countText(accounts.length)} href="/accounts" />
          <MenuRow
            icon={DOCUMENT_TYPE_ICON.kredi ?? 'cash-outline'}
            label="Krediler"
            detail={countText(totalsByType?.kredi?.count)}
            href={{ pathname: '/obligations', params: { type: 'kredi' } }}
          />
          <MenuRow
            icon="card-outline"
            label="Kredi kartları"
            detail={countText(creditCardAccounts.length)}
            href="/accounts/credit-cards"
          />
          <MenuRow
            icon={DOCUMENT_TYPE_ICON.cek ?? 'document-text-outline'}
            label="Çek ve senetler"
            detail={countText((totalsByType?.cek?.count ?? 0) + (totalsByType?.senet?.count ?? 0))}
            href="/instruments"
          />
          <MenuRow
            icon={DOCUMENT_TYPE_ICON.abonelik ?? 'repeat-outline'}
            label="Aboneliklerim"
            detail={countText(totalsByType?.abonelik?.count)}
            href="/aboneliklerim"
          />
          <MenuRow icon="logo-usd" label="Döviz ve altın" href="/accounts/value-units" />
          <MenuRow icon="people-outline" label="Kişiler ve firmalar" href="/counterparties" />
          <MenuRow icon="business-outline" label="Bankalar" href="/banks" />
          <MenuRow icon="pricetags-outline" label="Kategoriler" href="/categories" />
        </MenuGroup>

        <MenuGroup title="Analiz">
          {/* Eskiden alt sekmede ayrı bir "Raporlar" sekmesiydi — buraya taşındı. */}
          <MenuRow icon="bar-chart-outline" label="Raporlar" href="/reports" />
          <MenuRow icon="sparkles-outline" label="Akıllı öneriler" detail="Plus" href="/insights" />
          <MenuRow icon="folder-open-outline" label="Belge arşivi" href="/documents/archive" />
        </MenuGroup>

        <MenuGroup title="Uygulama">
          {activeWorkspaceId ? (
            <MenuRow
              icon="people-circle-outline"
              label="Çalışma alanı üyeleri"
              href={{ pathname: '/workspace/[id]/members', params: { id: activeWorkspaceId } }}
            />
          ) : null}
          <MenuRow icon="contrast-outline" label="Görünüm" href="/settings/appearance" />
          <MenuRow icon="notifications-outline" label="Bildirimler" href="/notifications" />
          <MenuRow icon="sparkles-outline" label="Abonelik ayarları" detail={planLabel} href="/subscription" />
          <MenuRow icon="settings-outline" label="Ayarlar" href="/settings" />
        </MenuGroup>
      </ScrollView>
    </SafeAreaView>
  );
}

function countText(count: number | null | undefined): string | undefined {
  return count === null || count === undefined ? undefined : String(count);
}

function PlanChip({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Text variant="label" color="textSecondary" numberOfLines={1} style={{ fontSize: 10 }}>
        {label}
      </Text>
    </View>
  );
}

// Gruplu menü: mono küçük başlık + tek yüzeyde ince çizgiyle ayrılmış satırlar.
function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="label" color="textSecondary">
        {title}
      </Text>
      <View style={{ borderRadius: theme.radius.widget, backgroundColor: theme.colors.surfacePrimary, overflow: 'hidden' }}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 ? (
              <View
                style={{
                  height: 1,
                  backgroundColor: theme.colors.border,
                  marginLeft: theme.spacing.md + 24 + theme.spacing.sm,
                }}
              />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

interface MenuRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  href: Href;
}

function MenuRow({ icon, label, detail, href }: MenuRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={() => router.push(href)}
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
      }}
    >
      <Ionicons name={icon} size={24} color={theme.colors.textPrimary} />
      <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </Text>
      {detail ? (
        <Text variant="label" color="textSecondary" tabular style={{ textTransform: 'none', fontSize: 13 }}>
          {detail}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={theme.colors.mutedControl} />
    </Pressable>
  );
}
