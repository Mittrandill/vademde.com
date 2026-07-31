import { useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { getCounterpartyBalances, listCounterparties } from '@/features/counterparties/api';
import { formatMinorAmount } from '@/utils/money';
import { matchesSearch, normalizeForSearch } from '@/utils/search';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';

type BalanceFilterKey = 'all' | 'receivable' | 'payable';

// Cari listesinde asıl soru "kim bana borçlu, ben kime borçluyum" — tür (kişi/firma)
// zaten satırdaki ikonda görünüyor, ayrı bir filtre satırı hak etmiyor.
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
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: theme.screenEdge.standard,
              gap: theme.spacing.sm,
              paddingBottom: theme.spacing.xxl,
            }}
            // Satıra dokunmak cari detayına gider; düzenleme oradaki kalem ikonundan.
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push(`/counterparties/${item.id}`)}>
                <Row
                  gap="sm"
                  style={{
                    backgroundColor: theme.colors.surfacePrimary,
                    borderRadius: theme.radius.widget,
                    padding: theme.spacing.md,
                  }}
                >
                  <Ionicons
                    name={item.type === 'company' ? 'business-outline' : 'person-outline'}
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="cardTitle" numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.phone || item.email ? (
                      <Text variant="caption" color="textSecondary" numberOfLines={1}>
                        {[item.phone, item.email].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </Stack>
                  <CounterpartyBalance netMinor={balances?.[item.id] ?? 0} />
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </Row>
              </Pressable>
            )}
          />
        )}
      </Stack>
    </SafeAreaView>
  );
}

// Cari bakiye işaretli okunur: pozitif = bu cari size borçlu (alacak), negatif = siz borçlusunuz.
// Bakiyesi kapalı olanlarda rakam yerine sessiz bir tire durur, liste gürültülenmesin.
function CounterpartyBalance({ netMinor }: { netMinor: number }) {
  const theme = useTheme();

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
      <Text
        variant="body"
        tabular
        style={{ color: owesUs ? theme.colors.success : theme.colors.textPrimary }}
      >
        {formatMinorAmount(Math.abs(netMinor))}
      </Text>
      <Text variant="caption" color="textSecondary">
        {owesUs ? 'alacak' : 'borç'}
      </Text>
    </Stack>
  );
}
