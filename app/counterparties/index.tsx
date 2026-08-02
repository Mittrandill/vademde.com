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
  Pagination,
  Pressable,
  ProgressRing,
  Row,
  SegmentedControl,
  Stack,
  Text,
  TextField,
} from '@/components/primitives';
import { Amount } from '@/components/finance/Amount';
import { PersonAvatar } from '@/components/finance/PersonAvatar';
import { getCounterpartyBalances, listCounterparties } from '@/features/counterparties/api';
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Stack gap="lg" style={{ flex: 1, paddingTop: theme.spacing.md }}>
        <Row style={{ paddingHorizontal: theme.screenEdge.standard }} align="center">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
          </Pressable>
          <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
            Kişi / Firmalar
          </Text>
          <Pressable onPress={() => router.push('/counterparties/new')} hitSlop={12}>
            <Ionicons name="add-circle" size={30} color={theme.colors.brandPrimary} />
          </Pressable>
        </Row>

        {(counterpartiesQuery.data ?? []).length > 0 ? (
          <Stack style={{ paddingHorizontal: theme.screenEdge.standard }}>
            <Card style={{ borderRadius: theme.radius.heroWidget, padding: theme.spacing.lg }}>
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
          </Stack>
        ) : null}

        <Stack gap="sm" style={{ paddingHorizontal: theme.screenEdge.standard }}>
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

        {counterpartiesQuery.isSuccess && filtered.length === 0 ? (
          <Stack
            gap="xs"
            style={{ flex: 1, justifyContent: 'center', paddingHorizontal: theme.screenEdge.standard }}
          >
            <Text variant="cardTitle">
              {(counterpartiesQuery.data ?? []).length === 0 ? 'Henüz kişi/firma yok' : 'Sonuç bulunamadı'}
            </Text>
            <Text variant="body" color="textSecondary">
              {(counterpartiesQuery.data ?? []).length === 0
                ? 'Sağ üstteki + ile ilk kişi veya firmanızı ekleyin.'
                : 'Arama terimini veya filtreyi değiştirin.'}
            </Text>
          </Stack>
        ) : (
          <>
          <FlatList
            data={pagedCounterparties}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: theme.screenEdge.standard,
              gap: theme.spacing.sm,
              paddingBottom: theme.spacing.xxl,
            }}
            // Satıra dokunmak cari detayına gider; düzenleme oradaki kalem ikonundan.
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push(`/counterparties/${item.id}`)}>
                <Card>
                  <Row gap="sm" align="center">
                    <PersonAvatar name={item.name} size={40} />
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
          />
          {totalPages > 1 ? (
            <View
              style={{
                paddingHorizontal: theme.screenEdge.standard,
                paddingTop: theme.spacing.sm,
                paddingBottom: theme.spacing.xs,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <Pagination page={effectivePage} totalPages={totalPages} onChange={setPage} />
            </View>
          ) : null}
          </>
        )}
      </Stack>
    </SafeAreaView>
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
