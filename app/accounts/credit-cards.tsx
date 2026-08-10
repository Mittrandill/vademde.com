import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  Pagination,
  Pressable,
  Row,
  SegmentedControl,
  Stack,
  Text,
  TextField,
} from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { DocumentCalendarIllustration } from '@/components/finance/DocumentCalendarIllustration';
import { listAccounts, type Account } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { listObligations, type ObligationWithRelations } from '@/features/obligations/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { matchesSearch, normalizeForSearch } from '@/utils/search';
import { computeStatementPeriod, periodKeyForDueDate } from '@/utils/creditCardPeriod';
import type { ValueUnitType } from '@/features/valueUnits/units';

const PAGE_SIZE = 10;
const monthFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });

// obligations/index.tsx'teki durum filtresinin (Aktif/Gecikmiş/Kapalı) kredi kartı
// karşılığı: kart bir obligation olmadığı için "durumu" yok, ama bu ekranda zaten
// hesaplanan "bu döneme ait ekstre yüklendi mi" bilgisi aynı rolü oynuyor.
type CardStatusKey = 'all' | 'awaiting' | 'uploaded';

const CARD_STATUS_OPTIONS: { key: CardStatusKey; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'awaiting', label: 'Ekstre Bekleyen' },
  { key: 'uploaded', label: 'Ekstre Yüklendi' },
];

// Ekran web'de doğrudan bu URL'e gidilerek (sayfa yenileme, deep link) açılırsa stack'te
// geri gidilecek bir geçmiş olmayabilir — router.back() bu durumda "GO_BACK was not
// handled" uyarısı verir. Öyle bir durumda Daha Fazla'ya (bu ekranın giriş noktası) düşülür.
function closeScreen() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/(tabs)/daha-fazla');
  }
}

// Kredilerim (obligations/index.tsx, type=kredi) ile aynı sayfa dili: tanıtım şeridi +
// istatistik hero kartı + arama + zengin liste kartları. Kredi kartları obligation değil
// hesap olduğu için liste kaynağı ve satır içerikleri farklı, ama iskelet bilerek aynı.
export default function CreditCardsScreen() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [searchInput, setSearchInput] = useState('');
  const [statusKey, setStatusKey] = useState<CardStatusKey>('all');
  const [sortAscending, setSortAscending] = useState(true);
  const [page, setPage] = useState(0);

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  // accounts/index.tsx ve accounts/[id].tsx ile aynı ham anahtar — o ekranlardaki
  // archive/invalidate akışlarıyla önbellek tutarlı kalsın diye queryKeys.reportAccountBalances
  // yerine bilerek bu anahtar kullanılıyor.
  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'account-balances'] : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const balanceByAccountId = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b.balanceMinor]));

  const allCards = useMemo(
    () => (accountsQuery.data ?? []).filter((a) => a.type === 'credit_card'),
    [accountsQuery.data]
  );

  // Her kartın en güncel ekstresini (satırda "Sıradaki ekstre" olarak) göstermek ve hero'daki
  // "ekstre bekleyen" sayısını hesaplamak için tek bir workspace-geneli sorgu — kart başına
  // ayrı sorgu yerine tek istekte alınıp account_id'ye göre gruplanır.
  const statementsQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'obligations', 'credit-card-statements'] : ['credit-card-statements', 'disabled'],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        documentType: 'kredi_karti_ekstresi',
        pageSize: 100,
        ascending: false,
      }),
    enabled: !!activeWorkspaceId && allCards.length > 0,
  });

  const statementsByAccount = useMemo(() => {
    const map = new Map<string, ObligationWithRelations[]>();
    for (const o of statementsQuery.data ?? []) {
      if (!o.account_id) continue;
      const list = map.get(o.account_id) ?? [];
      list.push(o);
      map.set(o.account_id, list);
    }
    return map;
  }, [statementsQuery.data]);

  // Her kartın kendi kesim/son ödeme gününe göre "bu dönem" farklıdır — tek bir global
  // ay anahtarıyla kıyaslamak yanlıştı (bkz. utils/creditCardPeriod.ts: son ödeme tarihi
  // sıklıkla bir sonraki aya sarkar, bu yüzden dönem due_date'in kendi ayı değildir).
  // Bu bilgi hem hero'daki sayaç hem de durum filtresi/sıralama için tek yerde hesaplanır
  // ve satır kartına prop olarak geçilir — CreditCardRowCard'da tekrar hesaplanmaz.
  const cardInfoById = useMemo(() => {
    const now = new Date();
    const map = new Map<string, { hasCurrentStatement: boolean; nextDueDate: Date | null }>();
    for (const a of allCards) {
      const currentPeriod = computeStatementPeriod(a, now);
      const statements = statementsByAccount.get(a.id) ?? [];
      const hasCurrentStatement =
        !!currentPeriod &&
        statements.some((o) => o.due_date && periodKeyForDueDate(a, o.due_date) === currentPeriod.periodKey);
      map.set(a.id, { hasCurrentStatement, nextDueDate: currentPeriod?.dueDate ?? null });
    }
    return map;
  }, [allCards, statementsByAccount]);

  const cardsAwaitingStatement = allCards.filter((a) => !cardInfoById.get(a.id)?.hasCurrentStatement).length;

  const cards = useMemo(() => {
    const query = normalizeForSearch(searchInput);
    const filtered = allCards.filter((a) => {
      const matchesText = matchesSearch(a.name, query) || matchesSearch(a.card_last_four ?? '', query);
      if (!matchesText) return false;
      const hasCurrentStatement = cardInfoById.get(a.id)?.hasCurrentStatement ?? false;
      if (statusKey === 'awaiting') return !hasCurrentStatement;
      if (statusKey === 'uploaded') return hasCurrentStatement;
      return true;
    });

    // Vadesi en yakın (ya da en uzak) kart en üstte — dönem bilgisi olmayan kartlar
    // (statement_day girilmemiş) her zaman en sonda kalır.
    return [...filtered].sort((a, b) => {
      const dueA = cardInfoById.get(a.id)?.nextDueDate ?? null;
      const dueB = cardInfoById.get(b.id)?.nextDueDate ?? null;
      if (!dueA && !dueB) return 0;
      if (!dueA) return 1;
      if (!dueB) return -1;
      return sortAscending ? dueA.getTime() - dueB.getTime() : dueB.getTime() - dueA.getTime();
    });
  }, [allCards, searchInput, statusKey, sortAscending, cardInfoById]);

  const resetKey = `${searchInput}|${statusKey}|${sortAscending ? 'asc' : 'desc'}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages - 1);
  const pagedCards = cards.slice(effectivePage * PAGE_SIZE, effectivePage * PAGE_SIZE + PAGE_SIZE);

  const totalDebtMinor = allCards.reduce(
    (sum, a) => sum + (balanceByAccountId.get(a.id) ?? a.opening_balance_minor),
    0
  );
  const isFiltered = searchInput.trim().length > 0 || statusKey !== 'all';

  const listHeader = (
    <Stack gap="md" style={{ paddingTop: theme.spacing.md, paddingBottom: theme.spacing.md }}>
      <ScreenHeader
        title="Kredi Kartlarım"
        left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: closeScreen }}
        right={{
          icon: 'add',
          accessibilityLabel: 'Yeni kredi kartı',
          variant: 'accent',
          onPress: () => router.push({ pathname: '/accounts/new', params: { type: 'credit_card' } }),
        }}
      />

      {/* Tanıtım şeridi: obligations/index.tsx'teki aynı sakin yüzey — istatistiklerden
          ayrı, sayfanın kimliğini taşır. */}
      <Card
        style={{
          borderRadius: theme.radius.heroWidget,
          padding: theme.spacing.lg,
          backgroundColor: withAlpha(theme.colors.brandPrimary, 0.08),
        }}
      >
        <Row gap="sm" align="center">
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.radius.input,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: withAlpha(theme.colors.brandPrimary, 0.18),
            }}
          >
            <Ionicons name="card-outline" size={22} color={theme.colors.brandPrimary} />
          </View>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle" numberOfLines={1}>
              Kartlarınız tek ekranda
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={2}>
              Borç, ekstre ve ödeme tarihlerini tek yerden takip edin.
            </Text>
          </Stack>
          <DocumentCalendarIllustration size={72} />
        </Row>
      </Card>

      {/* İstatistik hero kartı: Kredilerim'deki büyük tutar + sayaç satırı dili. */}
      <Card variant="hero">
        <Stack gap="lg">
          <Row gap="md" align="center">
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.4 }}>
                TOPLAM KART BORCU
              </Text>
              <Amount
                amountMinor={totalDebtMinor}
                variant="displayAmount"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
                style={{ color: totalDebtMinor > 0 ? theme.colors.danger : theme.colors.textPrimary }}
              />
            </Stack>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: theme.radius.input,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
              }}
            >
              <Ionicons name="card-outline" size={24} color={theme.colors.brandPrimary} />
            </View>
          </Row>

          <Divider />

          <Row>
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                TOPLAM KART
              </Text>
              <Text variant="cardTitle" tabular>
                {allCards.length}
              </Text>
            </Stack>
            {allCards.length > 0 ? (
              <>
                <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.sm }} />
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text
                    variant="caption"
                    color={cardsAwaitingStatement > 0 ? 'danger' : 'textSecondary'}
                    numberOfLines={1}
                  >
                    EKSTRE BEKLEYEN
                  </Text>
                  <Text
                    variant="cardTitle"
                    tabular
                    style={cardsAwaitingStatement > 0 ? { color: theme.colors.danger } : undefined}
                  >
                    {cardsAwaitingStatement}
                  </Text>
                </Stack>
              </>
            ) : null}
          </Row>

          <Button
            icon="add"
            label="Yeni Kredi Kartı Ekle"
            onPress={() => router.push({ pathname: '/accounts/new', params: { type: 'credit_card' } })}
          />
        </Stack>
      </Card>

      <SegmentedControl options={CARD_STATUS_OPTIONS} value={statusKey} onChange={setStatusKey} size="compact" stretch />

      <Row gap="xs">
        <View style={{ flex: 1, position: 'relative', justifyContent: 'center' }}>
          <Ionicons
            name="search"
            size={18}
            color={theme.colors.textSecondary}
            style={{ position: 'absolute', left: theme.spacing.sm, zIndex: 1 }}
          />
          <TextField
            placeholder="Kredi kartlarımda ara..."
            value={searchInput}
            onChangeText={setSearchInput}
            returnKeyType="search"
            autoCorrect={false}
            style={{ paddingLeft: theme.spacing.xxl }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tarihe göre sırala"
          onPress={() => setSortAscending((v) => !v)}
          style={{
            height: theme.buttonHeight.primary,
            paddingHorizontal: theme.spacing.sm,
            borderRadius: theme.radius.input,
            borderWidth: 1,
            borderColor: theme.colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xxs,
          }}
        >
          <Ionicons name={sortAscending ? 'arrow-up' : 'arrow-down'} size={14} color={theme.colors.textSecondary} />
          <Text variant="body" color="textSecondary">
            Tarih
          </Text>
        </Pressable>
      </Row>

      {accountsQuery.error ? (
        <Text variant="body" color="danger">
          {accountsQuery.error instanceof Error ? accountsQuery.error.message : 'Kredi kartları yüklenemedi'}
        </Text>
      ) : null}
    </Stack>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <FlatList
        data={pagedCards}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: theme.screenEdge.standard,
          paddingBottom: theme.spacing.xxl,
          gap: theme.spacing.md,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <CreditCardRowCard
            account={item}
            balanceMinor={balanceByAccountId.get(item.id) ?? item.opening_balance_minor}
            statements={statementsByAccount.get(item.id) ?? []}
            hasCurrentStatement={cardInfoById.get(item.id)?.hasCurrentStatement ?? false}
          />
        )}
        ListEmptyComponent={
          accountsQuery.isSuccess ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState
                icon={isFiltered ? 'search-outline' : 'card-outline'}
                title={isFiltered ? 'Sonuç bulunamadı' : 'Henüz kredi kartı yok'}
                message={
                  isFiltered
                    ? 'Arama terimini veya filtreleri değiştirin.'
                    : 'Kredi kartı ekleyerek borcunuzu ve ekstrelerinizi takip etmeye başlayın.'
                }
                actionLabel={isFiltered ? undefined : 'Yeni Kredi Kartı Ekle'}
                onActionPress={
                  isFiltered
                    ? undefined
                    : () => router.push({ pathname: '/accounts/new', params: { type: 'credit_card' } })
                }
              />
            </View>
          ) : null
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

interface CreditCardRowCardProps {
  account: Account;
  balanceMinor: number;
  statements: ObligationWithRelations[];
  hasCurrentStatement: boolean;
}

// Kredilerim'deki ObligationRowCard ile aynı yoğunluk: kimlik + büyük tutar + alt bilgi
// satırı — ama kaynak bir obligation değil, hesap + o hesaba bağlı ekstreler.
function CreditCardRowCard({ account, balanceMinor, statements, hasCurrentStatement }: CreditCardRowCardProps) {
  const theme = useTheme();
  const latestStatement = statements[0] ?? null;

  return (
    <Pressable onPress={() => router.push(`/accounts/${account.id}`)}>
      <Card>
        <Stack gap="sm">
          <Row gap="sm" align="center">
            <BankLogo bankCode={account.bank_code} fallbackIcon="card-outline" size={36} />
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="cardTitle" numberOfLines={1}>
                {account.name}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {account.card_last_four ? `•••• ${account.card_last_four}` : 'Kredi Kartı'}
              </Text>
            </Stack>
            <View
              style={{
                paddingHorizontal: theme.spacing.xs,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: withAlpha(hasCurrentStatement ? theme.colors.success : theme.colors.textSecondary, 0.14),
              }}
            >
              <Text
                variant="caption"
                style={{ color: hasCurrentStatement ? theme.colors.success : theme.colors.textSecondary }}
              >
                {hasCurrentStatement ? 'Ekstre yüklendi' : 'Ekstre bekliyor'}
              </Text>
            </View>
          </Row>

          <Row>
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="caption" color="textSecondary">
                GÜNCEL BORÇ
              </Text>
              <Amount
                amountMinor={balanceMinor}
                currencyCode={account.currency_code}
                variant="cardTitle"
                numberOfLines={1}
                overdue={balanceMinor > 0}
              />
            </Stack>
            <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.sm }} />
            <Stack gap="xxs" style={{ flex: 1 }} align="flex-end">
              <Text variant="caption" color="textSecondary">
                SON EKSTRE
              </Text>
              {latestStatement ? (
                <>
                  <Amount
                    amountMinor={latestStatement.remaining_amount_minor}
                    currencyCode={latestStatement.currency_code}
                    valueUnitType={latestStatement.value_unit_type as ValueUnitType}
                    variant="cardTitle"
                    numberOfLines={1}
                  />
                  {latestStatement.due_date ? (
                    <Text variant="caption" color="textSecondary" tabular numberOfLines={1}>
                      {monthFormatter.format(new Date(latestStatement.due_date))}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text variant="cardTitle" color="textSecondary" numberOfLines={1}>
                  Yok
                </Text>
              )}
            </Stack>
          </Row>

          {account.statement_day ? (
            <Row
              gap="xs"
              align="center"
              style={{
                backgroundColor: theme.colors.backgroundPrimary,
                borderRadius: theme.radius.input,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: theme.spacing.xs,
              }}
            >
              <Ionicons name="calendar-outline" size={14} color={theme.colors.textSecondary} />
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                Kesim: {account.statement_day}
                {account.payment_due_day ? ` · Son ödeme: ${account.payment_due_day}` : ''}
              </Text>
            </Row>
          ) : null}
        </Stack>
      </Card>
    </Pressable>
  );
}
