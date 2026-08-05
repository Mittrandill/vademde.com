import { useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import {
  ActionSheet,
  Divider,
  EmptyState,
  Pagination,
  Pressable,
  Row,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  TextField,
} from '@/components/primitives';
import { AccountLabelRow } from '@/components/finance/AccountLabelRow';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { BankLogo } from '@/components/finance/BankLogo';
import { CategoryIcon } from '@/components/finance/CategoryIcon';
import { DateBlock } from '@/components/finance/DateBlock';
import { listTransactions } from '@/features/transactions/api';
import { listObligations, listInstallmentsDue } from '@/features/obligations/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';

type FilterKey = 'all' | 'income' | 'expense' | 'payable' | 'receivable' | 'transfer';

// "Transfer" için ayrı bir hızlı-filtre sekmesi yok — transfer işlemleri "Tümü" altında
// görünmeye devam eder; bu, filtre satırının tek satırda (kaydırma/sarma olmadan) sığması içindir.
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
  direction: string;
  status?: string;
  documentType?: string;
  bankCode?: string | null;
  serviceCode?: string | null;
  categoryIcon?: string | null;
  isObligationPayment?: boolean;
  installmentId?: string | null;
  // Yalnızca kind === 'transaction' satırlarında doldurulur — hesap kimliğini alt
  // başlıkta banka logolu, yapılandırılmış bir satır olarak göstermek için (bkz.
  // AccountLabelRow). Kişi/firma varsa bunun yerine o gösterilir.
  counterpartyName?: string | null;
  accountName?: string | null;
  accountType?: string | null;
  cardLastFour?: string | null;
}

const DIRECTION_PREFIX: Record<string, string> = {
  income: '+',
  expense: '-',
  transfer: '⇄',
};

const DIRECTION_COLOR: Record<string, 'success' | 'textPrimary' | 'textSecondary'> = {
  income: 'success',
  expense: 'textPrimary',
  transfer: 'textSecondary',
};

const TRANSACTION_DIRECTION_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  income: 'arrow-down-circle-outline',
  expense: 'arrow-up-circle-outline',
  transfer: 'swap-horizontal-outline',
};

// Krediler listesindeki gerçek (numaralı) sayfalandırmayla aynı desen: kredi detayındaki
// Ödeme Planı/Geçmişi sekmeleri gibi, kaynaklar sınırlı ama cömert bir üst sınırla (500)
// tek seferde çekilir, tarihe göre sıralanır ve ekranda 10'luk sayfalar halinde dilimlenir —
// sonsuz kaydırma yerine sayfa numaralarıyla öngörülebilir gezinme.
const FETCH_SIZE = 500;
const LIST_PAGE_SIZE = 10;

export default function HareketlerScreen() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  // Krediler sayfasındaki Tarih düğmesiyle aynı: varsayılan en yeni önce (azalan).
  const [sortAscending, setSortAscending] = useState(false);
  const [page, setPage] = useState(0);

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
  const resetKey = `${filter}|${search}|${sortAscending ? 'asc' : 'desc'}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setPage(0);
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
    const transactionRows: HareketRow[] = wantsTransactions
      ? (transactionsQuery.data ?? []).map((t) => ({
          id: t.id,
          kind: 'transaction',
          title:
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
          counterpartyName: t.counterparty?.name ?? null,
          accountName: t.account?.name ?? null,
          accountType: t.account?.type ?? null,
          cardLastFour: t.account?.card_last_four ?? null,
          isObligationPayment: (t.payments?.length ?? 0) > 0,
        }))
      : [];

    const installmentItems = wantsObligations ? (installmentsQuery.data ?? []) : [];
    const obligationIdsWithInstallments = new Set(installmentItems.map((i) => i.id));

    const obligationRows: HareketRow[] = wantsObligations
      ? (obligationsQuery.data ?? [])
          .filter((o) => !obligationIdsWithInstallments.has(o.id))
          .map((o) => ({
            id: o.id,
            kind: 'obligation',
            title: o.title,
            subtitle: o.counterparty?.name || o.category?.name || '',
            date: o.due_date ?? o.created_at,
            amountMinor: o.total_amount_minor,
            currencyCode: o.currency_code,
            direction: o.direction,
            status: o.status,
            documentType: o.document_type,
            bankCode: o.bank_code,
            serviceCode: o.service_code,
          }))
      : [];

    // Hareketler yalnızca gerçekleşmiş hareketleri gösterir: henüz ödenmemiş (bekleyen)
    // taksitler burada listelenmez — onlar Takvim/Kredi detayında "yaklaşan ödeme" olarak
    // zaten görünür. `obligationIdsWithInstallments` seti yine TÜM taksitlerden türetilir
    // (yukarıda) ki taksitli bir kredinin üst-seviye özet satırı hiç ödeme yapılmamış olsa
    // bile burada ayrıca görünmesin.
    const paidInstallmentItems = installmentItems.filter((o) => o.remaining_amount_minor <= 0);

    const installmentRows: HareketRow[] = paidInstallmentItems.map((o) => ({
      id: o.id,
      kind: 'obligation',
      title: `${o.title} — ${o.installment_number}. Taksit`,
      subtitle: o.counterparty?.name || o.category?.name || '',
      date: o.due_date ?? o.created_at,
      amountMinor: o.total_amount_minor,
      currencyCode: o.currency_code,
      direction: o.direction,
      status: o.status,
      documentType: o.document_type,
      bankCode: o.bank_code,
      serviceCode: o.service_code,
      installmentId: o.installment_id,
    }));

    return [...transactionRows, ...obligationRows, ...installmentRows].sort((a, b) =>
      sortAscending
        ? new Date(a.date).getTime() - new Date(b.date).getTime()
        : new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [
    transactionsQuery.data,
    obligationsQuery.data,
    installmentsQuery.data,
    wantsTransactions,
    wantsObligations,
    sortAscending,
  ]);

  const totalPages = Math.max(1, Math.ceil(rows.length / LIST_PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages - 1);
  const visibleRows = rows.slice(effectivePage * LIST_PAGE_SIZE, effectivePage * LIST_PAGE_SIZE + LIST_PAGE_SIZE);

  const error = transactionsQuery.error || obligationsQuery.error || installmentsQuery.error;
  const isLoading = transactionsQuery.isLoading || obligationsQuery.isLoading || (wantsObligations && !search && installmentsQuery.isLoading);

  // Tek dikey scroll sahibi: başlık, arama/sıralama ve segment filtresi FlatList'in
  // ListHeaderComponent'ine taşınır ki liste kaydırıldığında hepsi tek parça halinde
  // birlikte kaysın — üstte sabit kalıp listeyi küçük bir kutuya sıkıştırmasınlar.
  const isInitialLoading = isLoading && rows.length === 0;

  const listHeader = (
    <Stack gap="md" style={{ paddingTop: theme.spacing.md, paddingBottom: theme.spacing.md }}>
      <Row align="center">
        <Text variant="pageTitle" style={{ flex: 1 }}>
          Hareketler
        </Text>
        <Pressable onPress={() => setAddSheetOpen(true)} hitSlop={12}>
          <Ionicons name="add-circle" size={30} color={theme.colors.brandPrimary} />
        </Pressable>
      </Row>

      <Row gap="xs" align="center">
        <TextField
          placeholder="Açıklama veya başlıkta ara"
          value={searchInput}
          onChangeText={setSearchInput}
          returnKeyType="search"
          autoCorrect={false}
          style={{ flex: 1 }}
        />
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

      {/* Elle yazılmış kapsül satırı yerine ortak bileşen: yükseklik uygulama genelinde
          tek token'dan gelsin (theme.controlHeight.segmented). */}
      <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} size="compact" stretch />

      {error ? (
        <Text variant="body" color="danger">
          {error instanceof Error ? error.message : 'Hareketler yüklenemedi'}
        </Text>
      ) : null}
    </Stack>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <FlatList
        data={visibleRows}
        keyExtractor={(item) => `${item.kind}-${item.id}${item.installmentId ? `-${item.installmentId}` : ''}`}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: theme.screenEdge.standard,
          // Kayan tab bar'ın altında kalmasın diye normalden fazla alt boşluk
          // (bkz. TabBar.tsx: mutlak konumlu, ~64+inset yükseklik).
          paddingBottom: theme.layout.tabBarClearance,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        // Satırlar artık ayrı ayrı kart değil, tek bir arka plan üzerinde ayraç
        // çizgileriyle bölünmüş tek bir liste gövdesi oluşturur (yalnızca ilk/son
        // satır köşeleri yuvarlanır) — Krediler/Borçlar'daki zengin kartlardan farklı
        // olarak burası tek satırlık kompakt kayıtlar içindir.
        ItemSeparatorComponent={() => <Divider style={{ marginHorizontal: theme.spacing.md }} />}
        renderItem={({ item, index }) => {
          const isFirst = index === 0;
          const isLast = index === visibleRows.length - 1;
          return (
            <Pressable
              onPress={() =>
                item.kind === 'obligation'
                  ? router.push(`/obligations/${item.id}`)
                  : router.push(`/transactions/${item.id}`)
              }
            >
              <Row
                gap="sm"
                align="center"
                style={{
                  backgroundColor: theme.colors.surfacePrimary,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  borderTopLeftRadius: isFirst ? theme.radius.widget : 0,
                  borderTopRightRadius: isFirst ? theme.radius.widget : 0,
                  borderBottomLeftRadius: isLast ? theme.radius.widget : 0,
                  borderBottomRightRadius: isLast ? theme.radius.widget : 0,
                }}
              >
                {item.kind === 'obligation' ? (
                  <ObligationIcon
                    documentType={item.documentType ?? 'diger'}
                    bankCode={item.bankCode}
                    serviceCode={item.serviceCode}
                    fallbackName={item.title}
                    size={36}
                  />
                ) : item.isObligationPayment ? (
                  // Bir borç/alacak ödemesinden otomatik oluşturulan hareket — kategorisi
                  // ne olursa olsun (belge türü kategori değildir) ödemenin yapıldığı
                  // hesabın banka logosu gösterilir.
                  <BankLogo bankCode={item.bankCode} size={36} />
                ) : item.categoryIcon ? (
                  <CategoryIcon icon={item.categoryIcon} size={36} />
                ) : (
                  <BankLogo bankCode={item.bankCode} fallbackIcon={TRANSACTION_DIRECTION_ICON[item.direction]} size={36} />
                )}
                <DateBlock date={item.date} />
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="cardTitle">{item.title}</Text>
                  {item.kind === 'transaction' && !item.counterpartyName && item.accountName ? (
                    <AccountLabelRow
                      bankCode={item.bankCode}
                      accountName={item.accountName}
                      accountType={item.accountType}
                      cardLastFour={item.cardLastFour}
                    />
                  ) : item.subtitle ? (
                    <Text variant="caption" color="textSecondary">
                      {item.subtitle}
                    </Text>
                  ) : null}
                  {item.status ? <StatusBadge status={item.status} /> : null}
                </Stack>
                <Text
                  variant="body"
                  tabular
                  color={item.kind === 'transaction' ? DIRECTION_COLOR[item.direction] : 'textPrimary'}
                >
                  {item.kind === 'transaction' ? DIRECTION_PREFIX[item.direction] : ''}
                  {formatMinorAmount(item.amountMinor, item.currencyCode)}
                </Text>
              </Row>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          isInitialLoading ? (
            <Stack gap="sm">
              <Skeleton height={64} borderRadius={theme.radius.widget} />
              <Skeleton height={64} borderRadius={theme.radius.widget} />
              <Skeleton height={64} borderRadius={theme.radius.widget} />
            </Stack>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState
                icon="receipt-outline"
                title={search ? 'Sonuç bulunamadı' : 'Henüz hareket yok'}
                message={search ? 'Farklı bir arama terimi deneyin.' : 'Sağ üstteki + ile ilk kaydınızı ekleyin.'}
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
              <Pagination
                page={effectivePage}
                totalPages={totalPages}
                loading={transactionsQuery.isFetching || obligationsQuery.isFetching || installmentsQuery.isFetching}
                onChange={setPage}
              />
            </View>
          ) : null
        }
      />

      <ActionSheet
        visible={addSheetOpen}
        title="Yeni Kayıt"
        onClose={() => setAddSheetOpen(false)}
        options={[
          {
            key: 'transaction',
            label: 'İşlem',
            description: 'Gerçekleşmiş gelir, gider veya transfer',
            icon: 'swap-horizontal-outline',
            onPress: () => router.push('/transactions/new'),
          },
          {
            key: 'obligation',
            label: 'Borç / Alacak',
            description: 'Vadeli kayıt: çek, senet, kredi, fatura',
            icon: 'calendar-outline',
            onPress: () => router.push('/obligations/new'),
          },
        ]}
      />
    </SafeAreaView>
  );
}
