import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import {
  Card,
  Divider,
  EmptyState,
  Pagination,
  Pressable,
  ProgressRing,
  Row,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  TextField,
} from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { PersonAvatar } from '@/components/finance/PersonAvatar';
import { getCounterpartyBalances, listCounterparties } from '@/features/counterparties/api';
import { listBanksWithLoans, type BankWithLoans } from '@/features/banks/api';
import { BANK_NAME } from '@/features/banks/banks';
import { matchesSearch, normalizeForSearch } from '@/utils/search';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';

const PAGE_SIZE = 10;

type BalanceFilterKey = 'all' | 'receivable' | 'payable';

// Cari listesinde asıl soru "kim bana borçlu, ben kime borçluyum" — tür (kişi/firma)
// zaten satırdaki avatarda görünüyor, ayrı bir filtre satırı hak etmiyor.
const BALANCE_FILTERS: { key: BalanceFilterKey; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'receivable', label: 'Alacak' },
  { key: 'payable', label: 'Borç' },
];

export default function CounterpartiesScreen() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilterKey>('all');
  const [page, setPage] = useState(0);

  const counterpartiesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.counterparties(activeWorkspaceId) : ['counterparties', 'disabled'],
    queryFn: () => listCounterparties(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'counterparties', 'balances'] : ['balances', 'disabled'],
    queryFn: () => getCounterpartyBalances(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const balances = balancesQuery.data;

  // Krediler kişi/firma değil banka bazlı tutulur (bkz. app/obligations/new.tsx) —
  // bu yüzden Kişi/Firmalar'da carilerin yanında açık kredisi olan bankalar da listelenir.
  const banksQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.banksWithLoans(activeWorkspaceId) : ['banks-with-loans', 'disabled'],
    queryFn: () => listBanksWithLoans(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const banks = banksQuery.data ?? [];

  const filtered = useMemo(() => {
    const counterparties = counterpartiesQuery.data ?? [];
    const query = normalizeForSearch(search);
    return counterparties.filter((c) => {
      if (!matchesSearch(c.name, query) && !matchesSearch(c.phone, query) && !matchesSearch(c.email, query)) {
        return false;
      }
      if (balanceFilter === 'all') return true;
      const net = balances?.[c.id] ?? 0;
      // "Alacak" = bu cari size borçlu, "Borç" = siz ona borçlusunuz.
      return balanceFilter === 'receivable' ? net > 0 : net < 0;
    });
  }, [counterpartiesQuery.data, search, balanceFilter, balances]);

  // Arama veya filtre değiştiğinde geçerli sayfa anlamsızlaşır — her zaman 1. sayfaya
  // dönülür (obligations/index.tsx'teki aynı render-sırasında-sıfırlama deseni).
  const resetKey = `${search}|${balanceFilter}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages - 1);
  const pagedCounterparties = filtered.slice(effectivePage * PAGE_SIZE, effectivePage * PAGE_SIZE + PAGE_SIZE);

  // Toplam alacak/borç şeridi: tüm carilerin net bakiyeleri işaretine göre ikiye
  // ayrıştırılır — filtreden bağımsız, "genel tablo ne durumda" sorusunun cevabı.
  const totals = useMemo(() => {
    let receivableMinor = 0;
    let payableMinor = 0;
    for (const c of counterpartiesQuery.data ?? []) {
      const net = balances?.[c.id] ?? 0;
      if (net > 0) receivableMinor += net;
      else payableMinor += -net;
    }
    return { receivableMinor, payableMinor };
  }, [counterpartiesQuery.data, balances]);

  // BalanceHero'daki aynı formül: halka, toplam bakiyenin değil alacak/borç dengesinin
  // görselidir — dolu kısım alacağın toplam içindeki payı.
  const directionalTotal = totals.receivableMinor + totals.payableMinor;
  const receivableShare = directionalTotal > 0 ? totals.receivableMinor / directionalTotal : 0;

  // Tek dikey scroll sahibi: başlık, hero alacak/borç kartı, arama ve filtre FlatList'in
  // ListHeaderComponent'ine taşınır ki liste kaydırıldığında hepsi tek parça halinde
  // birlikte kaysın — üstte sabit kalıp listeyi küçük bir kutuya sıkıştırmasınlar.
  const listHeader = (
    <Stack gap="lg" style={{ paddingTop: theme.spacing.md, paddingBottom: theme.spacing.md }}>
      <ScreenHeader
        title="Kişi / Firmalar"
        left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: () => router.back() }}
        right={{
          icon: 'add',
          accessibilityLabel: 'Yeni kişi/firma',
          variant: 'accent',
          onPress: () => router.push('/counterparties/new'),
        }}
      />

      {(counterpartiesQuery.data ?? []).length > 0 ? (
        <Card variant="hero">
          <Row gap="md" align="center">
            <ProgressRing
              size={60}
              strokeWidth={7}
              progress={receivableShare}
              color={theme.colors.success}
              trackColor={withAlpha(theme.colors.success, 0.18)}
              cap
            >
              <Ionicons name="people-outline" size={18} color={theme.colors.success} />
            </ProgressRing>
            <Row gap="sm" style={{ flex: 1 }}>
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                  ALACAK
                </Text>
                <Amount
                  amountMinor={totals.receivableMinor}
                  direction="receivable"
                  variant="cardTitle"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                />
              </Stack>
              <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.sm }} />
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                  BORÇ
                </Text>
                <Amount
                  amountMinor={totals.payableMinor}
                  direction="payable"
                  variant="cardTitle"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                />
              </Stack>
            </Row>
          </Row>
        </Card>
      ) : null}

      {banks.length > 0 ? (
        <Stack gap="sm">
          <SectionHeader title="Bankalar" />
          <Stack gap="xs">
            {banks.map((bank) => (
              <BankRow key={bank.bankCode} bank={bank} />
            ))}
          </Stack>
        </Stack>
      ) : null}

      <Stack gap="sm">
        <TextField
          placeholder="İsim, telefon veya e-postada ara"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        <SegmentedControl
          options={BALANCE_FILTERS}
          value={balanceFilter}
          onChange={setBalanceFilter}
          size="compact"
          stretch
        />
      </Stack>
    </Stack>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <FlatList
        data={pagedCounterparties}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: theme.screenEdge.standard,
          gap: theme.spacing.sm,
          paddingBottom: theme.spacing.xxl,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        // Satıra dokunmak cari detayına gider; düzenleme oradaki kalem ikonundan.
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/counterparties/${item.id}`)}>
            <Card>
              <Row gap="sm" align="center">
                <PersonAvatar name={item.name} size={36} />
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Row gap="xxs" align="center">
                    <Text variant="cardTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {item.name}
                    </Text>
                    {item.type === 'company' ? (
                      <Ionicons name="business" size={13} color={theme.colors.textSecondary} />
                    ) : null}
                  </Row>
                  {item.phone || item.email ? (
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      {[item.phone, item.email].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </Stack>
                <CounterpartyBalance netMinor={balances?.[item.id] ?? 0} />
              </Row>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          !counterpartiesQuery.isSuccess ? (
            <Stack gap="sm">
              <Skeleton height={64} borderRadius={theme.radius.widget} />
              <Skeleton height={64} borderRadius={theme.radius.widget} />
              <Skeleton height={64} borderRadius={theme.radius.widget} />
            </Stack>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState
                icon="people-outline"
                title={(counterpartiesQuery.data ?? []).length === 0 ? 'Henüz kişi/firma yok' : 'Sonuç bulunamadı'}
                message={
                  (counterpartiesQuery.data ?? []).length === 0
                    ? 'Sağ üstteki + ile ilk kişi veya firmanızı ekleyin.'
                    : 'Arama terimini veya filtreyi değiştirin.'
                }
              />
            </View>
          )
        }
        ListFooterComponent={
          totalPages > 1 ? (
            <View
              style={{
                paddingTop: theme.spacing.sm,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <Pagination page={effectivePage} totalPages={totalPages} onChange={setPage} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

// Banka satırı, cari satırıyla aynı görsel dili paylaşır (avatar yerine logo) — açık
// kredi sayısı ve net bakiye (neredeyse her zaman borç) tek satırda özetlenir.
function BankRow({ bank }: { bank: BankWithLoans }) {
  const bankName = BANK_NAME[bank.bankCode] ?? bank.bankCode;
  return (
    <Pressable onPress={() => router.push(`/banks/${bank.bankCode}`)}>
      <Card>
        <Row gap="sm" align="center">
          <BankLogo bankCode={bank.bankCode} fallbackName={bankName} size={36} />
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
              {bankName}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {bank.count} kredi{bank.overdueCount > 0 ? ` · ${bank.overdueCount} gecikmiş` : ''}
            </Text>
          </Stack>
          <CounterpartyBalance netMinor={bank.netMinor} />
        </Row>
      </Card>
    </Pressable>
  );
}

// Cari bakiye işaretli okunur: pozitif = bu cari size borçlu (alacak), negatif = siz borçlusunuz.
// Bakiyesi kapalı olanlarda rakam yerine sessiz bir tire durur, liste gürültülenmesin.
function CounterpartyBalance({ netMinor }: { netMinor: number }) {
  if (netMinor === 0) {
    return (
      <Text variant="caption" color="textSecondary">
        —
      </Text>
    );
  }

  const owesUs = netMinor > 0;
  return (
    <Stack gap="xxs" style={{ alignItems: 'flex-end' }}>
      <Amount amountMinor={Math.abs(netMinor)} direction={owesUs ? 'receivable' : 'payable'} variant="body" />
      <Text variant="caption" color="textSecondary">
        {owesUs ? 'alacak' : 'borç'}
      </Text>
    </Stack>
  );
}
