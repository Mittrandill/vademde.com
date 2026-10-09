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
        <Text variant="pageTitle">Daha fazla</Text>

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
                  {fullName || 'Profilini tamamla'}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {email ?? '—'}
                </Text>
              </View>
              <Tag label={planLabel} />
              <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
            </Pressable>
            {isFree ? (
              <MenuRow icon="star" tone="brand" label="Vademde Plus’ı deneyin" href="/paywall" />
            ) : ocrUsage ? (
              <MenuRow icon="scan" label="Kalan tarama hakkı" detail={`${ocrUsage.remaining} / ${ocrUsage.quota}`} href="/subscription" />
            ) : null}
          </Group>
        </View>

        <MenuGroup title="Kayıt türleri">
          <MenuRow
            icon={DOCUMENT_TYPE_ICON.cek ?? 'document-text'}
            label="Çek ve senetler"
            detail={countText(
              instrumentTotalsQuery.data
                ? (instrumentTotalsQuery.data.cek?.count ?? 0) + (instrumentTotalsQuery.data.senet?.count ?? 0)
                : undefined
            )}
            href="/instruments"
          />
          <MenuRow
            icon="cash"
            label="Kredilerim"
            detail={countText(totalsByType?.kredi?.count)}
            href={{ pathname: '/obligations', params: { type: 'kredi' } }}
          />
          <MenuRow icon="card" label="Kredi kartlarım" detail={countText(creditCardAccounts.length)} href="/accounts/credit-cards" />
          <MenuRow
            icon="repeat"
            label="Aboneliklerim"
            detail={countText(totalsByType?.abonelik?.count)}
            href="/aboneliklerim"
          />
          <MenuRow
            icon="people"
            label="Kişiler / Cariler"
            detail={countText(counterpartiesQuery.data?.length)}
            href="/counterparties"
          />
        </MenuGroup>

        <MenuGroup title="Yönetim">
          <MenuRow icon="wallet" label="Hesaplar" detail={countText(accounts.length)} href="/accounts" />
          <MenuRow icon="business" label="Bankalar" href="/banks" />
          <MenuRow icon="logo-usd" label="Döviz ve altın" href="/accounts/value-units" />
          <MenuRow icon="bar-chart" label="Raporlar" href="/reports" />
          <MenuRow icon="sparkles" label="Akıllı öneriler" detail="Plus" href="/insights" />
          <MenuRow icon="folder-open" label="Belge arşivi" href="/documents/archive" />
          <MenuRow icon="briefcase" label="Çalışma alanları" href="/workspace" />
          {activeWorkspaceId ? (
            <MenuRow
              icon="people-circle"
              label="Çalışma alanı üyeleri"
              href={{ pathname: '/workspace/[id]/members', params: { id: activeWorkspaceId } }}
            />
          ) : null}
        </MenuGroup>

        <MenuGroup title="Uygulama">
          <MenuRow icon="settings" label="Ayarlar" href="/settings" />
          <MenuRow icon="pricetags" label="Kategoriler" href="/categories" />
          <MenuRow icon="contrast" label="Görünüm" href="/settings/appearance" />
          <MenuRow icon="notifications" label="Bildirimler" href="/notifications" />
          <MenuRow icon="ribbon" label="Abonelik ayarları" detail={planLabel} href="/subscription" />
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
