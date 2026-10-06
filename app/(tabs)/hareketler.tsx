import { useEffect, useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import {
  Card,
  EmptyState,
  Group,
  ListEnd,
  ListSkeleton,
  LIST_PAGE_SIZE,
  LoadMore,
  MONTH_NAMES,
  MonthStepper,
  MonthYearSheet,
  Pressable,
  ScrollableTabs,
  Text,
} from '@/components/primitives';
import { AccountIcon } from '@/components/finance/AccountIcon';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { BankLogo } from '@/components/finance/BankLogo';
import { CategoryIcon } from '@/components/finance/CategoryIcon';
import { listTransactions, type TransactionWithRelations } from '@/features/transactions/api';
import { listObligations, listInstallmentsDue } from '@/features/obligations/api';
import { listValueUnitRates, sumToReferenceMinor } from '@/features/valueUnits/api';
import { queryKeys } from '@/services/queryKeys';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount, formatValueUnitAmount } from '@/utils/money';

type FilterKey = 'all' | 'income' | 'expense' | 'payable' | 'receivable' | 'transfer';

// "Transfer" için ayrı bir hızlı-filtre sekmesi yok; transfer işlemleri "Tümü" altında
// görünmeye devam eder.
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'income', label: 'Gelir' },
  { key: 'expense', label: 'Gider' },
  { key: 'payable', label: 'Borç' },
  { key: 'receivable', label: 'Alacak' },
];

interface HareketRow {
  id: string;
  kind: 'transaction' | 'obligation';
  title: string;
  subtitle: string;
  date: string;
  amountMinor: number;
  currencyCode: string;
  // Yalnızca kind === 'obligation' satırlarında anlamlıdır (bkz. Amount/formatValueUnitAmount
  // — currencyCode kıymetli maden kodu ise ISO 4217 formatlayıcısı RangeError fırlatır).
  valueUnitType?: string;
  direction: string;
  status?: string;
  documentType?: string;
  bankCode?: string | null;
  serviceCode?: string | null;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  categoryName?: string | null;
  installmentId?: string | null;
  // Yalnızca kind === 'transaction' satırlarında doldurulur — hesap kimliğini alt
  // başlıkta banka logolu, yapılandırılmış bir satır olarak göstermek için (bkz.
  // AccountLabelRow). Kişi/firma varsa bunun yerine o gösterilir.
  counterpartyName?: string | null;
  accountName?: string | null;
  accountType?: string | null;
  cardLastFour?: string | null;
  // Yalnızca accountType === 'cash' olan hesaplarda ikon için (bkz. AccountIcon).
  accountCurrencyCode?: string | null;
  // Yalnızca transfer yönündeki işlemlerde dolar: paranın gittiği hesap. Asıl ikon olarak
  // bundan yararlanılır (bkz. renderItem) — ör. bir kredi kartı ödemesinde asıl ikon kartın
  // kendi logosudur, kaynak hesap (accountName) alt satırda kalır.
  transferToBankCode?: string | null;
  transferToAccountName?: string | null;
  transferToAccountType?: string | null;
  transferToCurrencyCode?: string | null;
  // Yalnızca kind === 'obligation' satırlarında doldurulur: bu taksit/borç bir hesaptan
  // ödendiyse (bkz. rows useMemo'daki eşleme), ödemenin yapıldığı hesap — ayrı bir
  // "işlem" satırı göstermek yerine bu bilgi doğrudan taksit/borç satırının alt
  // başlığında gösterilir.
  paidAccountBankCode?: string | null;
  paidAccountName?: string | null;
  paidAccountType?: string | null;
  paidAccountCardLastFour?: string | null;
  paidAccountCurrencyCode?: string | null;
}

const TRANSACTION_DIRECTION_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  income: 'arrow-down-circle-outline',
  expense: 'arrow-up-circle-outline',
  transfer: 'swap-horizontal-outline',
};

// "Tümü" sekmesinde taksitsiz borç/alacaklardan yalnızca en az bir ödeme/tahsilat görmüş
// olanlar gerçekleşmiş sayılır (bkz. rows useMemo'daki filtre).
const REALIZED_OBLIGATION_STATUSES = new Set(['odendi', 'tahsil_edildi', 'kismen_odendi', 'kismen_tahsil_edildi']);

// Bir ödeme hesap seçilmeden (elden/nakit) kaydedilirse ilişkili bir transaction hiç
// oluşmaz (bkz. features/payments/api.ts recordPayment) — bu yüzden gerçek ödeme tarihi
// için ilişkili transaction'a değil, doğrudan payments.paid_at'e güvenilir. Birden fazla
// ödeme varsa en sonuncusu (en yeni paid_at) gösterilir.
function latestPaidAt(payments: { paid_at: string }[] | undefined): string | undefined {
  if (!payments?.length) return undefined;
  return payments.reduce((latest, p) => (p.paid_at > latest ? p.paid_at : latest), payments[0].paid_at);
}

// Krediler listesindeki gerçek (numaralı) sayfalandırmayla aynı desen: kredi detayındaki
// Ödeme Planı/Geçmişi sekmeleri gibi, kaynaklar sınırlı ama cömert bir üst sınırla (500)
// tek seferde çekilir, tarihe göre sıralanır ve ekranda 10'luk sayfalar halinde dilimlenir —
// sonsuz kaydırma yerine sayfa numaralarıyla öngörülebilir gezinme.
const FETCH_SIZE = 500;

export default function HareketlerScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const showQuickAdd = useQuickAddStore((s) => s.show);
  // Krediler sayfasındaki Tarih düğmesiyle aynı: varsayılan en yeni önce (azalan).
  const [sortAscending, setSortAscending] = useState(false);
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
  const [monthSheetOpen, setMonthSheetOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const valueUnitRatesQuery = useQuery({
    queryKey: queryKeys.valueUnitRates(),
    queryFn: listValueUnitRates,
  });

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const wantsTransactions = filter === 'all' || ['income', 'expense', 'transfer'].includes(filter);
  const wantsObligations = filter === 'all' || ['payable', 'receivable'].includes(filter);
  const transactionDirection = wantsTransactions && filter !== 'all' ? (filter as 'income' | 'expense' | 'transfer') : undefined;
  const obligationDirection = wantsObligations && filter !== 'all' ? (filter as 'payable' | 'receivable') : undefined;

  // Filtre, arama veya sıralama değiştiğinde geçerli sayfa anlamsızlaşır — render sırasında
  // (obligations/index.tsx'teki aynı desen) 1. sayfaya dönülür, ekstra render turu olmadan.
  const resetKey = `${filter}|${search}|${sortAscending ? 'asc' : 'desc'}|${month.year}-${month.month}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setVisibleCount(LIST_PAGE_SIZE);
  }

  const transactionsQuery = useQuery({
    queryKey: [activeWorkspaceId, 'transactions', 'hareketler', transactionDirection ?? 'all', search],
    queryFn: () =>
      listTransactions({
        workspaceId: activeWorkspaceId as string,
        direction: transactionDirection,
        search: search || undefined,
        pageSize: FETCH_SIZE,
      }),
    enabled: !!activeWorkspaceId && wantsTransactions,
  });

  const obligationsQuery = useQuery({
    queryKey: [activeWorkspaceId, 'obligations', 'hareketler', obligationDirection ?? 'all', search],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        direction: obligationDirection,
        search: search || undefined,
        pageSize: FETCH_SIZE,
      }),
    enabled: !!activeWorkspaceId && wantsObligations,
  });

  // Taksitli kredi/borçlarda her taksit ayrı satır olarak görünür (bkz. listInstallmentsDue);
  // bu obligation'ların tekil listObligations satırı aşağıda dışlanır. Arama, sadece taksitsiz
  // kayıtlarda ve işlemlerde uygulanır — taksitlere metin araması eklenmemiştir.
  const installmentsQuery = useQuery({
    queryKey: [activeWorkspaceId, 'obligations', 'installments-hareketler', obligationDirection ?? 'all'],
    queryFn: () =>
      listInstallmentsDue({
        workspaceId: activeWorkspaceId as string,
        direction: obligationDirection,
        pageSize: FETCH_SIZE,
      }),
    enabled: !!activeWorkspaceId && wantsObligations && !search,
  });

  const rows = useMemo<HareketRow[]>(() => {
    const transactionsData = wantsTransactions ? (transactionsQuery.data ?? []) : [];

    // Bir taksit/borç bir hesaptan ödendiğinde hem hesap çıkışını temsil eden bir
    // `transaction` hem de bu taksit/borç kaydı oluşur — ikisi aynı olayın iki yüzüdür.
    // İki ayrı satır yerine tek satır göstermek için: ödeme kaydı taşıyan işlemler
    // (payments doluysa) aşağıda hiç ayrı satır olarak eklenmez; hangi hesaptan
    // ödendiği bilgisi ilgili taksit/borç satırının alt başlığına taşınır.
    const paymentTxByInstallmentId = new Map<string, TransactionWithRelations>();
    const paymentTxByObligationId = new Map<string, TransactionWithRelations>();
    for (const t of transactionsData) {
      for (const p of t.payments ?? []) {
        if (p.installment_id) paymentTxByInstallmentId.set(p.installment_id, t);
        else if (p.obligation_id) paymentTxByObligationId.set(p.obligation_id, t);
      }
    }

    const transactionRows: HareketRow[] = transactionsData
      .filter((t) => (t.payments?.length ?? 0) === 0)
      .map((t) => ({
        id: t.id,
        kind: 'transaction',
        title:
          t.counterparty?.name ||
          t.description?.trim() ||
          t.category?.name ||
          (t.direction === 'transfer' ? 'Transfer' : t.direction === 'income' ? 'Gelir' : 'Gider'),
        subtitle: t.counterparty?.name || t.account?.name || '',
        date: t.occurred_at,
        amountMinor: t.amount_minor,
        currencyCode: t.currency_code,
        direction: t.direction,
        bankCode: t.account?.bank_code ?? null,
        categoryIcon: t.category?.icon ?? null,
        categoryName: t.category?.name ?? null,
        categoryColor: t.category?.color ?? null,
        counterpartyName: t.counterparty?.name ?? null,
        accountName: t.account?.name ?? null,
        accountType: t.account?.type ?? null,
        cardLastFour: t.account?.card_last_four ?? null,
        accountCurrencyCode: t.account?.currency_code ?? null,
        transferToBankCode: t.transferToAccount?.bank_code ?? null,
        transferToAccountName: t.transferToAccount?.name ?? null,
        transferToAccountType: t.transferToAccount?.type ?? null,
        transferToCurrencyCode: t.transferToAccount?.currency_code ?? null,
      }));

    const installmentItems = wantsObligations ? (installmentsQuery.data ?? []) : [];
    const obligationIdsWithInstallments = new Set(installmentItems.map((i) => i.id));

    const obligationRows: HareketRow[] = wantsObligations
      ? (obligationsQuery.data ?? [])
          .filter((o) => !obligationIdsWithInstallments.has(o.id))
          // "Tümü" sekmesi yalnızca gerçekleşmiş hareketleri gösterir: henüz hiç ödeme/tahsilat
          // görmemiş (bekliyor/gecikti/taslak/inceleme_gerekli/iptal_edildi) taksitsiz borç/alacaklar
          // burada listelenmez. Borç/Alacak sekmelerinde (obligationDirection dolu, yani filter
          // 'all' değil) bu kısıtlama uygulanmaz — o sekmelerin amacı zaten bekleyenleri de görmek.
          .filter((o) => filter !== 'all' || REALIZED_OBLIGATION_STATUSES.has(o.status))
          .map((o) => {
            const paymentTx = paymentTxByObligationId.get(o.id);
            // "Tümü" sekmesinde kısmen ödenen/tahsil edilen bir borç/alacak tüm tutarıyla değil,
            // yalnızca o ana kadar gerçekten ödenen/tahsil edilen kısmıyla görünür — kalan (henüz
            // gerçekleşmemiş) kısım burada bir hareket değildir. Borç/Alacak sekmelerinde ve tam
            // ödenmiş/tahsil edilmiş kayıtlarda tutar değişmeden (tam tutar) kalır.
            const isPartialInAll =
              filter === 'all' && (o.status === 'kismen_odendi' || o.status === 'kismen_tahsil_edildi');
            const realizedAmountMinor = isPartialInAll
              ? o.total_amount_minor - o.remaining_amount_minor
              : o.total_amount_minor;
            // "Tümü" bu satırda yalnızca gerçekleşen ödenen/tahsil edilen kısmı gösterdiği için
            // rozet de "kısmen" değil, o kısmın kendisi tamammış gibi görünür — asıl "kısmen
            // ödendi/tahsil edildi" durumu (kalan borçla birlikte) yalnızca Borç/Alacak
            // sekmelerinde değişmeden kalır.
            const displayStatus = isPartialInAll
              ? o.status === 'kismen_odendi'
                ? 'odendi'
                : 'tahsil_edildi'
              : o.status;
            return {
              id: o.id,
              kind: 'obligation',
              title: o.title,
              subtitle: o.counterparty?.name || o.category?.name || '',
              // "Tümü" sekmesi gerçekte ödendiği tarihi (payments.paid_at) gösterir — vade
              // tarihi değil. Hesaptan yapılan ödemelerde bağlı transaction'ın occurred_at'i de
              // aynı tarihi taşır (bkz. recordPayment/updatePayment) ama elden/nakit ödemelerde
              // hiç transaction oluşmaz, o yüzden önce doğrudan payments'a bakılır. Borç/Alacak
              // sekmelerinde ise (henüz ödenmemiş kalan tutarla birlikte gösterildiği için) her
              // zaman vade tarihi kalır.
              date:
                filter === 'all'
                  ? (latestPaidAt(o.payments) ?? paymentTx?.occurred_at ?? o.due_date ?? o.created_at)
                  : (o.due_date ?? o.created_at),
              amountMinor: realizedAmountMinor,
              currencyCode: o.currency_code,
              valueUnitType: o.value_unit_type,
              direction: o.direction,
              status: displayStatus,
              documentType: o.document_type,
              bankCode: o.bank_code,
              serviceCode: o.service_code,
              paidAccountBankCode: paymentTx?.account?.bank_code ?? null,
              paidAccountName: paymentTx?.account?.name ?? null,
              paidAccountType: paymentTx?.account?.type ?? null,
              paidAccountCardLastFour: paymentTx?.account?.card_last_four ?? null,
              paidAccountCurrencyCode: paymentTx?.account?.currency_code ?? null,
            };
          })
      : [];

    // Hareketler yalnızca gerçekleşmiş hareketleri gösterir: henüz ödenmemiş (bekleyen)
    // taksitler burada listelenmez — onlar Takvim/Kredi detayında "yaklaşan ödeme" olarak
    // zaten görünür. `obligationIdsWithInstallments` seti yine TÜM taksitlerden türetilir
    // (yukarıda) ki taksitli bir kredinin üst-seviye özet satırı hiç ödeme yapılmamış olsa
    // bile burada ayrıca görünmesin.
    const paidInstallmentItems = installmentItems.filter((o) => o.remaining_amount_minor <= 0);

    const installmentRows: HareketRow[] = paidInstallmentItems.map((o) => {
      const paymentTx = o.installment_id ? paymentTxByInstallmentId.get(o.installment_id) : undefined;
      return {
        id: o.id,
        kind: 'obligation',
        title: `${o.title} — ${o.installment_number}. Taksit`,
        subtitle: o.counterparty?.name || o.category?.name || '',
        // bkz. yukarıdaki obligationRows'taki aynı not — bu satırlar zaten yalnızca ödenmiş
        // taksitler (paidInstallmentItems), gerçek ödeme tarihi vade tarihinden farklı olabilir.
        date:
          filter === 'all'
            ? (latestPaidAt(o.payments) ?? paymentTx?.occurred_at ?? o.due_date ?? o.created_at)
            : (o.due_date ?? o.created_at),
        amountMinor: o.total_amount_minor,
        currencyCode: o.currency_code,
        valueUnitType: o.value_unit_type,
        direction: o.direction,
        status: o.status,
        documentType: o.document_type,
        bankCode: o.bank_code,
        serviceCode: o.service_code,
        installmentId: o.installment_id,
        paidAccountBankCode: paymentTx?.account?.bank_code ?? null,
        paidAccountName: paymentTx?.account?.name ?? null,
        paidAccountType: paymentTx?.account?.type ?? null,
        paidAccountCardLastFour: paymentTx?.account?.card_last_four ?? null,
        paidAccountCurrencyCode: paymentTx?.account?.currency_code ?? null,
      };
    });

    return [...transactionRows, ...obligationRows, ...installmentRows].sort((a, b) =>
      sortAscending
        ? new Date(a.date).getTime() - new Date(b.date).getTime()
        : new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [
    transactionsQuery.data,
    obligationsQuery.data,
    installmentsQuery,
    wantsTransactions,
    wantsObligations,
    filter,
    sortAscending,
  ]);

  // Ay filtresi istemci tarafındadır: kaynaklar zaten tek seferde (FETCH_SIZE) çekiliyor;
  // veri sorguları ve filtre mantığı değişmedi, yalnızca görünür dilim aya göre daraltılır.
  const monthRows = useMemo(
    () =>
      rows.filter((r) => {
        const d = new Date(r.date);
        return d.getFullYear() === month.year && d.getMonth() === month.month;
      }),
    [rows, month]
  );

  const rateList = valueUnitRatesQuery.data ?? [];
  const sumSigned = (items: HareketRow[]) =>
    sumToReferenceMinor(
      items.map((r) => ({ amountMinor: r.amountMinor, unitCode: r.currencyCode })),
      rateList
    );

  const monthTotals = useMemo(() => {
    const income = sumSigned(monthRows.filter((r) => rowSign(r) > 0));
    const expense = sumSigned(monthRows.filter((r) => rowSign(r) < 0));
    return { income, expense };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthRows, rateList]);

  const visibleRows = monthRows.slice(0, visibleCount);

  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    let currentKey = '';
    let group: HareketRow[] = [];
    const flush = () => {
      if (group.length === 0) return;
      const net = sumSigned(group.filter((r) => rowSign(r) > 0)) - sumSigned(group.filter((r) => rowSign(r) < 0));
      items.push({
        type: 'day',
        key: `day-${currentKey}`,
        date: group[0].date,
        netMinor: net,
        rows: group.map((r) => ({ key: `${r.kind}-${r.id}${r.installmentId ? `-${r.installmentId}` : ''}`, row: r })),
      });
      group = [];
    };
    for (const r of visibleRows) {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (key !== currentKey) {
        flush();
        currentKey = key;
      }
      group.push(r);
    }
    flush();
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, rateList]);

  const error = transactionsQuery.error || obligationsQuery.error || installmentsQuery.error;
  const isLoading = transactionsQuery.isLoading || obligationsQuery.isLoading || (wantsObligations && !search && installmentsQuery.isLoading);

  // Tek dikey scroll sahibi: başlık, ay gezgini ve filtreler FlatList'in ListHeaderComponent'inde.
  const isInitialLoading = isLoading && rows.length === 0;
  const isFetching = transactionsQuery.isFetching || obligationsQuery.isFetching || installmentsQuery.isFetching;
  const netTotal = monthTotals.income - monthTotals.expense;

  const listHeader = (
    <View style={{ paddingTop: theme.spacing.xxs, paddingBottom: theme.spacing.xs, gap: 12 }}>
      <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <Pressable
          onPress={() => setSortAscending((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Tarihe göre sırala"
          style={headerButtonStyle(theme.colors.fill)}
        >
          <Ionicons name={sortAscending ? 'arrow-up' : 'arrow-down'} size={18} color={theme.colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={showQuickAdd}
          accessibilityRole="button"
          accessibilityLabel="Yeni hareket"
          style={headerButtonStyle(theme.colors.fill)}
        >
          <Ionicons name="add" size={20} color={theme.colors.textPrimary} />
        </Pressable>
      </View>
      <Text variant="pageTitle">Hareketler</Text>

      <View
        style={{
          height: 36,
          borderRadius: 10,
          backgroundColor: theme.colors.fill,
          paddingHorizontal: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Ionicons name="search" size={17} color={theme.colors.textSecondary} />
        <TextInput
          placeholder="Ara"
          placeholderTextColor={theme.colors.textSecondary}
          value={searchInput}
          onChangeText={setSearchInput}
          returnKeyType="search"
          autoCorrect={false}
          selectionColor={theme.colors.brandPrimary}
          style={{ flex: 1, fontSize: 17, color: theme.colors.textPrimary, padding: 0 }}
        />
        {searchInput.length > 0 ? (
          <Pressable accessibilityLabel="Aramayı temizle" onPress={() => setSearchInput('')} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={theme.colors.mutedControl} />
          </Pressable>
        ) : null}
      </View>

      <ScrollableTabs tabs={FILTERS} activeKey={filter} onChange={(key) => setFilter(key as FilterKey)} />

      <MonthStepper
        year={month.year}
        month={month.month}
        onChange={setMonth}
        onPressLabel={() => setMonthSheetOpen(true)}
      />

      <Card style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" color="textSecondary">
            {MONTH_NAMES[month.month]} · {monthRows.length} hareket
          </Text>
          <Text
            variant="displayAmount"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{ fontSize: 22, lineHeight: 28, color: netTotal >= 0 ? theme.colors.receivable : theme.colors.textPrimary }}
          >
            {netTotal >= 0 ? '+' : '−'}
            {formatMinorAmount(Math.abs(netTotal))}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text tabular style={{ fontSize: 15, fontWeight: '600', color: theme.colors.receivable }}>
            +{formatMinorAmount(monthTotals.income)}
          </Text>
          <Text tabular style={{ fontSize: 15, fontWeight: '600' }}>
            −{formatMinorAmount(monthTotals.expense)}
          </Text>
        </View>
      </Card>

      {error ? (
        <Text color="danger">{error instanceof Error ? error.message : 'Hareketler yüklenemedi'}</Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <FlatList
        data={listItems}
        keyExtractor={(item) => item.key}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: theme.screenEdge.standard,
          // Alt sekme çubuğunun altında kalmasın diye ek boşluk.
          paddingBottom: theme.layout.tabBarClearance,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => <DayGroup date={item.date} rows={item.rows} />}
        ListEmptyComponent={
          isInitialLoading ? (
            <ListSkeleton rows={5} />
          ) : (
            <View style={{ paddingTop: theme.spacing.xl }}>
              <EmptyState
                icon="receipt-outline"
                title={search ? 'Sonuç bulunamadı' : 'Bu ayda hareket yok'}
                message={
                  search
                    ? 'Farklı bir arama terimi deneyin.'
                    : 'Başka bir ay seçin ya da sağ üstteki + ile kayıt ekleyin.'
                }
              />
            </View>
          )
        }
        ListFooterComponent={
          monthRows.length === 0 ? null : visibleCount < monthRows.length ? (
            <LoadMore
              loaded={visibleRows.length}
              total={monthRows.length}
              noun="hareket"
              loading={isFetching}
              onPress={() => setVisibleCount((c) => c + LIST_PAGE_SIZE)}
            />
          ) : (
            <View style={{ paddingTop: theme.spacing.md }}>
              <ListEnd label={`Hepsi bu kadar · ${monthRows.length} hareket`} />
            </View>
          )
        }
      />

      <MonthYearSheet
        visible={monthSheetOpen}
        onClose={() => setMonthSheetOpen(false)}
        year={month.year}
        month={month.month}
        onChange={setMonth}
      />
    </SafeAreaView>
  );
}

type ListItem =
  | { type: 'day'; key: string; date: string; netMinor: number; rows: { key: string; row: HareketRow }[] };

// Gelir (+1) / gider (-1) / etkisiz (0): işlemde yöne, borç/alacakta payable/receivable'a göre.
function rowSign(r: HareketRow): number {
  if (r.direction === 'income' || r.direction === 'receivable') return 1;
  if (r.direction === 'expense' || r.direction === 'payable') return -1;
  return 0;
}

const dayFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });

function headerButtonStyle(backgroundColor: string) {
  return { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor } as const;
}

// Tuval Hareketler: gün başlığı büyük harf küçük etiket (.ov), altında o günün satırları tek gruplu yüzeyde.
function DayGroup({ date, rows }: { date: string; rows: { key: string; row: HareketRow }[] }) {
  const theme = useTheme();
  const d = new Date(date);
  const today = new Date();
  const diff = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000
  );
  const label = diff === 0 ? 'Bugün' : diff === 1 ? 'Dün' : dayFormatter.format(d);

  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <Text variant="label" color="textSecondary" style={{ marginBottom: 10 }}>
        {label}
      </Text>
      <Group inset={62}>
        {rows.map(({ key, row }) => (
          <HareketRowView key={key} item={row} />
        ))}
      </Group>
    </View>
  );
}

function HareketRowView({ item }: { item: HareketRow }) {
  const theme = useTheme();
  const sign = rowSign(item);
  const prefix = sign > 0 ? '+' : sign < 0 ? '−' : '';
  const amountColor = sign > 0 ? 'receivable' : item.direction === 'transfer' ? 'textSecondary' : 'textPrimary';
  const account =
    item.kind === 'transaction'
      ? item.accountName
      : item.paidAccountName ?? null;
  const subtitle = [item.kind === 'transaction' ? categoryOrType(item) : item.subtitle, account]
    .filter((part) => !!part && part !== item.title)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        item.kind === 'obligation' ? router.push(`/obligations/${item.id}`) : router.push(`/transactions/${item.id}`)
      }
      style={{ minHeight: 56, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      {item.kind === 'obligation' ? (
        <ObligationIcon
          documentType={item.documentType ?? 'diger'}
          bankCode={item.bankCode}
          serviceCode={item.serviceCode}
          fallbackName={item.title}
          size={34}
        />
      ) : item.categoryIcon ? (
        <CategoryIcon icon={item.categoryIcon} color={item.categoryColor} size={34} />
      ) : item.direction === 'transfer' && (item.transferToBankCode || item.transferToAccountName) ? (
        <AccountIcon
          bankCode={item.transferToBankCode}
          accountType={item.transferToAccountType}
          currencyCode={item.transferToCurrencyCode}
          fallbackName={item.transferToAccountName}
          size={34}
        />
      ) : (
        <BankLogo bankCode={item.bankCode} fallbackIcon={TRANSACTION_DIRECTION_ICON[item.direction]} size={34} />
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontWeight: '500' }}>
          {item.title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text tabular style={{ fontWeight: '600', color: theme.colors[amountColor] }}>
          {prefix}
          {item.valueUnitType === 'kiymetli_maden'
            ? formatValueUnitAmount(item.amountMinor, item.currencyCode)
            : formatMinorAmount(item.amountMinor, item.currencyCode)}
        </Text>
        {item.status ? <StatusBadge status={item.status} /> : null}
      </View>
    </Pressable>
  );
}

// İşlem satırının alt başlığı: kategori adı yoksa yön etiketi (Gelir/Gider/Transfer).
function categoryOrType(item: HareketRow): string {
  if (item.categoryName) return item.categoryName;
  return item.direction === 'transfer' ? 'Transfer' : '';
}
