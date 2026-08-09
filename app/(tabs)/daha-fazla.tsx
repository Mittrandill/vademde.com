import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import type { ThemeColors } from '@/theme/colors';
import { Card, Divider, Pressable, Row, SectionHeader, Stack, Text } from '@/components/primitives';
import { listAccounts } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { getObligationTotalsByType } from '@/features/obligations/api';
import { DOCUMENT_TYPE_ICON, DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import { getMyProfile } from '@/features/profile/api';
import { getMySubscription } from '@/features/subscriptions/api';
import { useSession } from '@/features/auth/useSession';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';

// Hub'da gösterilecek belge türleri. Tümü değil, günlük kullanımda sık geçenler —
// gerisine Hareketler'in belge türü filtresinden ulaşılır. "Kredi" ve "Kredi Kartlarım"
// (hesap bazlı, kendi ekranı) elle en başa yerleştirildiği için burada değil; geri kalanlar
// aynı sırayla map'lenir.
const OTHER_DOCUMENT_TYPES = ['cek', 'senet', 'kira', 'abonelik'];

// Kayıt türü kutuları tek düze mor yerine türe göre renk taşır — komşu iki kutu her
// zaman farklı tonda olsun diye elle eşlenir (docs §12.9: her belge türü kendi kimliğini
// taşır). Renkler yalnızca tema token'larından gelir, sabit hex yok.
const RECORD_ACCENTS: Record<string, keyof ThemeColors> = {
  kredi: 'accentViolet',
  kredi_karti: 'brandPrimary',
  cek: 'accentAqua',
  senet: 'success',
  kira: 'accentViolet',
  abonelik: 'brandPrimary',
};

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

  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'account-balances'] : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const totalsByType = totalsQuery.data;
  const accounts = accountsQuery.data ?? [];
  const balanceByAccountId = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b.balanceMinor]));
  const creditCardAccounts = accounts.filter((a) => a.type === 'credit_card');
  const totalCardDebtMinor = creditCardAccounts.reduce(
    (sum, a) => sum + (balanceByAccountId.get(a.id) ?? a.opening_balance_minor),
    0
  );

  const email = session?.user?.email ?? null;
  const fullName = profileQuery.data?.full_name ?? null;
  const planCode = subscriptionQuery.data?.plan ?? 'free';
  const planLabel = PLAN_LABELS[planCode] ?? planCode;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          // Kayan tab bar'ın altında kalmasın diye normalden fazla alt boşluk
          // (bkz. TabBar.tsx: mutlak konumlu, ~64+inset yükseklik).
          paddingBottom: theme.layout.tabBarClearance,
          gap: theme.spacing.lg,
        }}
      >
        <Text variant="pageTitle">Daha Fazla</Text>

        {/* Profil kartı — hesap ekranının en üstünde durur, dokununca kendi Profil
            ekranına gider (More sekmesi = hesap girişi deseni; iOS Ayarlar'daki Apple ID
            satırıyla aynı mantık — genel Ayarlar'a değil, doğrudan kimlik ekranına). */}
        <Pressable onPress={() => router.push('/profile')}>
          <Card elevated>
            <Row gap="sm">
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
                }}
              >
                <Text variant="cardTitle" style={{ color: theme.colors.brandPrimary }}>
                  {initialsFrom(fullName, email)}
                </Text>
              </View>
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Row gap="xs" align="center">
                  <Text variant="cardTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {fullName || 'Profilini tamamla'}
                  </Text>
                  <PlanChip label={planLabel} isFree={planCode === 'free'} />
                </Row>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {email ?? '—'}
                </Text>
              </Stack>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </Row>
          </Card>
        </Pressable>

        <Stack gap="sm">
          <SectionHeader title="Kayıt Türleri" />
          <Row gap="sm" style={{ flexWrap: 'wrap' }}>
            <HubTile
              icon={DOCUMENT_TYPE_ICON.kredi ?? 'cash-outline'}
              label={DOCUMENT_TYPE_LABEL.kredi ?? 'Kredi'}
              detail={
                totalsByType?.kredi
                  ? `${totalsByType.kredi.count} kayıt · ${formatMinorAmount(totalsByType.kredi.totalMinor)}`
                  : 'Kayıt yok'
              }
              accent={theme.colors[RECORD_ACCENTS.kredi]}
              href={{ pathname: '/obligations', params: { type: 'kredi' } }}
            />
            {/* Kartlar artık obligation türü değil, hesap bazlı bir liste — kendi
                ekranına (Kredi Kartlarım) gider, Kredi'nin hemen ardında yer alır. */}
            <HubTile
              icon="card-outline"
              label="Kredi Kartlarım"
              detail={
                creditCardAccounts.length > 0
                  ? `${creditCardAccounts.length} kart · ${formatMinorAmount(totalCardDebtMinor)}`
                  : 'Kart yok'
              }
              accent={theme.colors[RECORD_ACCENTS.kredi_karti]}
              href="/accounts/credit-cards"
            />
            {OTHER_DOCUMENT_TYPES.map((type) => {
              const totals = totalsByType?.[type];
              const accentKey = RECORD_ACCENTS[type] ?? 'accentViolet';
              return (
                <HubTile
                  key={type}
                  icon={DOCUMENT_TYPE_ICON[type] ?? 'document-outline'}
                  label={DOCUMENT_TYPE_LABEL[type] ?? type}
                  detail={totals ? `${totals.count} kayıt · ${formatMinorAmount(totals.totalMinor)}` : 'Kayıt yok'}
                  accent={theme.colors[accentKey]}
                  href={{ pathname: '/obligations', params: { type } }}
                />
              );
            })}
          </Row>
        </Stack>

        <Stack gap="sm">
          <SectionHeader title="Yönetim" />
          <Card style={{ padding: 0 }}>
            <ListRow
              icon="wallet-outline"
              label="Hesaplar"
              detail={accounts.length > 0 ? `${accounts.length} hesap` : 'Hesap yok'}
              accent={theme.colors.success}
              href="/accounts"
            />
            <RowDivider />
            <ListRow
              icon="people-outline"
              label="Kişiler"
              detail="Kişi ve firmalar"
              accent={theme.colors.accentAqua}
              href="/counterparties"
            />
            <RowDivider />
            <ListRow
              icon="pricetags-outline"
              label="Kategoriler"
              detail="Gelir ve gider"
              accent={theme.colors.accentViolet}
              href="/categories"
            />
            <RowDivider />
            {/* Eskiden alt sekmede ayrı bir "Raporlar" sekmesiydi — kayan tab bar
                yalnızca en sık kullanılan beş akışa ayrıldığından buraya taşındı. */}
            <ListRow
              icon="bar-chart-outline"
              label="Raporlar"
              detail="Gelir, gider ve borç/alacak özeti"
              accent={theme.colors.brandPrimary}
              href="/reports"
            />
          </Card>
        </Stack>

        <Stack gap="sm">
          <SectionHeader title="Uygulama" />
          <Card style={{ padding: 0 }}>
            <ListRow
              icon="settings-outline"
              label="Ayarlar"
              detail="Hesap, görünüm ve abonelik"
              accent={theme.colors.textSecondary}
              href="/settings"
            />
          </Card>
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanChip({ label, isFree }: { label: string; isFree: boolean }) {
  const theme = useTheme();
  const tone = isFree ? theme.colors.textSecondary : theme.colors.brandPrimary;
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 2,
        borderRadius: theme.radius.pill,
        backgroundColor: withAlpha(tone, 0.15),
      }}
    >
      <Text variant="caption" style={{ color: tone, fontWeight: '600' }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

interface HubTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  accent: string;
  href: Href;
}

function HubTile({ icon, label, detail, accent, href }: HubTileProps) {
  const theme = useTheme();

  return (
    // Grid: minWidth satır başına kaç kutu sığacağını belirler (dar telefonda 2),
    // flex:1 ile aynı satırdakiler kalan genişliği eşit paylaşır.
    <Pressable onPress={() => router.push(href)} style={{ flex: 1, minWidth: 140 }}>
      <Card>
        <Stack gap="sm">
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.radius.input,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: withAlpha(accent, 0.14),
            }}
          >
            <Ionicons name={icon} size={20} color={accent} />
          </View>
          <Stack gap="xxs">
            <Text variant="cardTitle" numberOfLines={1}>
              {label}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {detail}
            </Text>
          </Stack>
        </Stack>
      </Card>
    </Pressable>
  );
}

interface ListRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  accent: string;
  href: Href;
}

// Yönetim/Uygulama satırları: tek bir kart içinde ayraçlı liste — navigasyon amaçlı
// olduğu için (veri taşımayan) kutu yerine satır olarak gösterilir, kayıt türü
// kutularından görsel olarak ayrışır.
function ListRow({ icon, label, detail, accent, href }: ListRowProps) {
  const theme = useTheme();

  return (
    <Pressable onPress={() => router.push(href)}>
      <Row gap="sm" style={{ padding: theme.spacing.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.radius.input,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(accent, 0.14),
          }}
        >
          <Ionicons name={icon} size={20} color={accent} />
        </View>
        <Stack gap="xxs" style={{ flex: 1 }}>
          <Text variant="cardTitle" numberOfLines={1}>
            {label}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {detail}
          </Text>
        </Stack>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
      </Row>
    </Pressable>
  );
}

// Liste satırlarını ayıran çizgi ikonun bittiği yerden başlasın diye sola girinti verir.
function RowDivider() {
  const theme = useTheme();
  return <Divider style={{ marginLeft: theme.spacing.md + 40 + theme.spacing.sm }} />;
}
