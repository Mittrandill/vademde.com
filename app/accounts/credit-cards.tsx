import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import {
  Divider,
  Pressable,
  Skeleton,
  Stack,
  Text,
} from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { FinanceFilterCard } from '@/components/finance/FinanceFilterCard';
import { FinanceListHero } from '@/components/finance/FinanceListHero';
import { FinanceListEmptyState, FinanceListSurface } from '@/components/finance/FinanceListSurface';
import { listAccounts, type Account } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { listObligations, type ObligationWithRelations } from '@/features/obligations/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { matchesSearch, normalizeForSearch } from '@/utils/search';
import { computeStatementPeriod, periodKeyForDueDate } from '@/utils/creditCardPeriod';
import { formatMinorAmount } from '@/utils/money';

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
  const reflowKey = useReflowKey();
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
  const openNewCard = () => router.push({ pathname: '/accounts/new', params: { type: 'credit_card' } });
  const footerLabel = cards.length
    ? `${effectivePage * PAGE_SIZE + 1}–${Math.min((effectivePage + 1) * PAGE_SIZE, cards.length)} / ${cards.length} kart`
    : '0 kart gösteriliyor';

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.screenEdge.standard,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Stack gap="lg">
          <ScreenHeader
            title="Kredi Kartlarım"
            left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: closeScreen }}
            right={{ icon: 'add', accessibilityLabel: 'Yeni kredi kartı', variant: 'accent', onPress: openNewCard }}
          />

          <FinanceListHero
            label="TOPLAM KART BORCU"
            description="Kredi kartlarınızın güncel toplam borcu"
            amountText={formatMinorAmount(totalDebtMinor)}
            amountColor={totalDebtMinor > 0 ? 'danger' : 'textPrimary'}
            metrics={[
              { label: 'TOPLAM KART', value: allCards.length, caption: 'Tüm kartlar' },
              { label: 'EKSTRE BEKLEYEN', value: cardsAwaitingStatement, caption: 'Yüklenmesi gereken', valueColor: cardsAwaitingStatement > 0 ? 'danger' : undefined },
              { label: 'EKSTRE YÜKLENDİ', value: allCards.length - cardsAwaitingStatement, caption: 'Bu dönem', valueColor: 'success' },
              { label: 'BORÇLU KART', value: allCards.filter((account) => (balanceByAccountId.get(account.id) ?? account.opening_balance_minor) > 0).length, caption: 'Bakiye taşıyan', valueColor: 'danger' },
            ]}
          />

          <FinanceFilterCard
            title="EKSTRE DURUMU"
            description="Listede görmek istediğiniz ekstre durumunu seçin."
            options={CARD_STATUS_OPTIONS}
            value={statusKey}
            onChange={setStatusKey}
          />

          <FinanceListSurface
            searchPlaceholder="Kredi kartlarımda ara..."
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            sortAction={{
              label: 'Tarih',
              accessibilityLabel: 'Tarihe göre sırala',
              icon: sortAscending ? 'arrow-up' : 'arrow-down',
              onPress: () => setSortAscending((value) => !value),
            }}
            footerLabel={pagedCards.length > 0 ? footerLabel : undefined}
            actionLabel={pagedCards.length > 0 ? 'Yeni kredi kartı' : undefined}
            onActionPress={pagedCards.length > 0 ? openNewCard : undefined}
            page={effectivePage}
            totalPages={totalPages}
            onPageChange={setPage}
          >
            {accountsQuery.error ? (
              <Text variant="body" color="danger" style={{ padding: theme.spacing.lg }}>
                {accountsQuery.error instanceof Error ? accountsQuery.error.message : 'Kredi kartları yüklenemedi'}
              </Text>
            ) : !accountsQuery.isSuccess ? (
              <Stack gap="sm" style={{ padding: theme.spacing.lg }}>
                <Skeleton height={72} borderRadius={theme.radius.widget} />
                <Skeleton height={72} borderRadius={theme.radius.widget} />
              </Stack>
            ) : pagedCards.length === 0 ? (
              <FinanceListEmptyState
                icon={isFiltered ? 'search-outline' : 'card-outline'}
                title={isFiltered ? 'Sonuç bulunamadı' : 'Henüz kredi kartı yok'}
                message={isFiltered ? 'Arama terimini veya filtreleri değiştirin.' : 'Kredi kartı ekleyerek borcunuzu ve ekstrelerinizi takip etmeye başlayın.'}
                actionLabel={isFiltered ? undefined : 'Yeni kredi kartı'}
                onActionPress={isFiltered ? undefined : openNewCard}
              />
            ) : (
              pagedCards.map((item, index) => (
                <View key={item.id}>
                  {index > 0 ? <Divider /> : null}
                  <CreditCardRowCard
                    account={item}
                    balanceMinor={balanceByAccountId.get(item.id) ?? item.opening_balance_minor}
                    statements={statementsByAccount.get(item.id) ?? []}
                    hasCurrentStatement={cardInfoById.get(item.id)?.hasCurrentStatement ?? false}
                  />
                </View>
              ))
            )}
          </FinanceListSurface>
        </Stack>
      </ScrollView>
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
  const detail = [
    account.card_last_four ? `•••• ${account.card_last_four}` : 'Kredi Kartı',
    hasCurrentStatement ? 'Ekstre yüklendi' : 'Ekstre bekliyor',
    latestStatement?.due_date ? monthFormatter.format(new Date(latestStatement.due_date)) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${account.name} kart detayını aç`}
      onPress={() => router.push(`/accounts/${account.id}`)}
      style={{
        minHeight: 86,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
      }}
    >
      <BankLogo bankCode={account.bank_code} fallbackIcon="card-outline" size={48} />
      <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
        <Text variant="cardTitle" numberOfLines={1}>
          {account.name}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {detail}
        </Text>
      </Stack>
      <Amount
        amountMinor={balanceMinor}
        currencyCode={account.currency_code}
        direction="expense"
        variant="cardTitle"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.68}
        style={{ maxWidth: '34%', color: theme.colors.danger }}
      />
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
    </Pressable>
  );
}
