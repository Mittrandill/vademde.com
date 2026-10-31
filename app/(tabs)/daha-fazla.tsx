import { assetText as ta } from '@/features/assets/copy';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Group, GroupedRowIcon, Pressable, Tag, Text } from '@/components/primitives';
import { listAccounts } from '@/features/accounts/api';
import { listCounterparties } from '@/features/counterparties/api';
import { getObligationTotalsByType, ACTIVE_OBLIGATION_STATUSES } from '@/features/obligations/api';
import { DOCUMENT_TYPE_ICON } from '@/features/obligations/documentTypes';
import { getMyProfile } from '@/features/profile/api';
import { listSupportThreads } from '@/features/support/api';
import { currentPeriodMonth, getCurrentOcrUsage, getMySubscription } from '@/features/subscriptions/api';
import { useSession } from '@/features/auth/useSession';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { t } from '@/i18n';
import { PLAN_LABELS } from '@/features/subscriptions/planLabels';

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

  const supportQuery = useQuery({
    queryKey: queryKeys.supportThreads(),
    queryFn: listSupportThreads,
  });
  const supportUnread = (supportQuery.data ?? []).reduce((sum, thread) => sum + thread.unread, 0);

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

  // Çek ve senetler ekranı kapalı (ödenmiş/tahsil edilmiş/ciro edilmiş) kayıtları da listeler;
  // menüdeki sayı o ekranla tutarlı olsun diye iptal dışındaki tüm durumlar sayılır.
  const instrumentTotalsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? [activeWorkspaceId, 'obligations', 'instrument-menu-totals']
      : ['instrument-menu-totals', 'disabled'],
    queryFn: () =>
      getObligationTotalsByType(activeWorkspaceId as string, [...ACTIVE_OBLIGATION_STATUSES, 'odendi', 'tahsil_edildi']),
    enabled: !!activeWorkspaceId,
  });

  const counterpartiesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.counterparties(activeWorkspaceId) : ['counterparties', 'disabled'],
    queryFn: () => listCounterparties(activeWorkspaceId as string),
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

  const isFree = planCode === 'free';

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.screenEdge.standard,
          paddingTop: 44,
          // Kayan tab bar'ın altında kalmasın diye normalden fazla alt boşluk.
          paddingBottom: theme.layout.tabBarClearance,
        }}
      >
        <Text variant="pageTitle">{t('nav.more.title')}</Text>

        {/* Profil: dokununca kendi Profil ekranına gider; ücretsiz planda yükseltme satırı altında. */}
        <View style={{ marginTop: theme.spacing.md }}>
          <Group inset={62}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/profile')}
              style={{ paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.brandPrimary,
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: '600', color: theme.colors.onAction }}>
                  {initialsFrom(fullName, email)}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontWeight: '600' }}>
                  {fullName || t('nav.more.completeProfile')}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {email ?? '—'}
                </Text>
              </View>
              <Tag label={planLabel} />
              <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
            </Pressable>
            {isFree ? (
              <MenuRow icon="star" tone="brand" label={t('nav.more.tryPlus')} href="/paywall" />
            ) : ocrUsage ? (
              <MenuRow icon="scan" label={t('nav.more.scansLeft')} detail={`${ocrUsage.remaining} / ${ocrUsage.quota}`} href="/subscription" />
            ) : null}
          </Group>
        </View>

        <MenuGroup title={t('nav.more.recordTypes')}>
          <MenuRow
            icon={DOCUMENT_TYPE_ICON.cek ?? 'document-text'}
            label={t('nav.more.instruments')}
            detail={countText(
              instrumentTotalsQuery.data
                ? (instrumentTotalsQuery.data.cek?.count ?? 0) + (instrumentTotalsQuery.data.senet?.count ?? 0)
                : undefined
            )}
            href="/instruments"
          />
          <MenuRow
            icon="cash"
            label={t('nav.more.loans')}
            detail={countText(totalsByType?.kredi?.count)}
            href={{ pathname: '/obligations', params: { type: 'kredi' } }}
          />
          <MenuRow icon="card" label={t('nav.more.creditCards')} detail={countText(creditCardAccounts.length)} href="/accounts/credit-cards" />
          <MenuRow
            icon="repeat"
            label={t('nav.more.subscriptions')}
            detail={countText(totalsByType?.abonelik?.count)}
            href="/aboneliklerim"
          />
          <MenuRow
            icon="people"
            label={t('nav.more.counterparties')}
            detail={countText(counterpartiesQuery.data?.length)}
            href="/counterparties"
          />
        </MenuGroup>

        <MenuGroup title={t('nav.more.management')}>
          <MenuRow icon="home" label={ta('Varlıklarım')} href="/assets" />
          <MenuRow icon="wallet" label={t('nav.more.accounts')} detail={countText(accounts.length)} href="/accounts" />
          <MenuRow icon="business" label={t('nav.more.banks')} href="/banks" />
          <MenuRow icon="logo-usd" label={t('nav.more.valueUnits')} href="/accounts/value-units" />
          <MenuRow icon="bar-chart" label={t('nav.more.reports')} href="/reports" />
          <MenuRow icon="sparkles" label={t('nav.more.insights')} detail="Plus" href="/insights" />
          <MenuRow icon="folder-open" label={t('nav.more.archive')} href="/documents/archive" />
          <MenuRow icon="briefcase" label={t('nav.more.workspaces')} href="/workspace" />
          {activeWorkspaceId ? (
            <MenuRow
              icon="people-circle"
              label={t('nav.more.members')}
              href={{ pathname: '/workspace/[id]/members', params: { id: activeWorkspaceId } }}
            />
          ) : null}
        </MenuGroup>

        <MenuGroup title={t('nav.more.app')}>
          <MenuRow icon="settings" label={t('nav.more.settings')} href="/settings" />
          <MenuRow icon="pricetags" label={t('nav.more.categories')} href="/categories" />
          <MenuRow icon="contrast" label={t('nav.more.appearance')} href="/settings/appearance" />
          <MenuRow icon="notifications" label={t('nav.more.notifications')} href="/notifications" />
          <MenuRow icon="ribbon" label={t('nav.more.subscriptionSettings')} detail={planLabel} href="/subscription" />
          <MenuRow
            icon="chatbubbles"
            label={t('nav.more.support')}
            detail={supportUnread > 0 ? t('nav.more.supportUnread', { count: supportUnread }) : undefined}
            href="/destek"
          />
        </MenuGroup>
      </ScrollView>
    </SafeAreaView>
  );
}

function countText(count: number | null | undefined): string | undefined {
  return count === null || count === undefined ? undefined : String(count);
}

// Gruplu menü: büyük harf küçük başlık + tek yüzeyde ince çizgiyle ayrılmış satırlar.
function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ marginTop: theme.spacing.xl }}>
      <Text variant="label" color="textSecondary" style={{ marginBottom: 10 }}>
        {title}
      </Text>
      <Group inset={62}>{children}</Group>
    </View>
  );
}

interface MenuRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  href: Href;
  tone?: 'default' | 'brand' | 'brandSoft' | 'violet' | 'success' | 'danger' | 'aqua';
}

function MenuRow({ icon, label, detail, href, tone = 'default' }: MenuRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={() => router.push(href)}
      style={{ minHeight: 56, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <GroupedRowIcon name={icon} tone={tone} />
      <Text numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </Text>
      {detail ? (
        <Text color="textSecondary" tabular>
          {detail}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
    </Pressable>
  );
}
