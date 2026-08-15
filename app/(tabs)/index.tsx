import { useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Pressable, Row, Skeleton, Stack, Text } from '@/components/primitives';
import { BalanceHero } from '@/components/finance/BalanceHero';
import { QuickActions } from '@/components/finance/QuickActions';
import { UpcomingDueList } from '@/components/finance/UpcomingDueList';
import { PendingReviewQueue } from '@/components/finance/PendingReviewQueue';
import { CreditCardDueWidget } from '@/components/finance/CreditCardDueWidget';
import { RecentTransactionsList } from '@/components/finance/RecentTransactionsList';
import { listMyWorkspaces } from '@/features/workspaces/api';
import { listAccounts } from '@/features/accounts/api';
import {
  listObligations,
  listInstallmentsDue,
  ACTIVE_OBLIGATION_STATUSES,
  type ObligationDueItem,
} from '@/features/obligations/api';
import { listTransactions } from '@/features/transactions/api';
import { getAllTimeIncomeExpenseTotals, getMonthTransactionTotals, getPendingReviewDocuments } from '@/features/dashboard/api';
import { listValueUnitRates, sumToReferenceMinor } from '@/features/valueUnits/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { syncCreditCardStatementReminder } from '@/services/creditCardReminders';
import { useReflowKey } from '@/services/reflow';

export default function HomeScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { activeWorkspaceId, setActiveWorkspaceId, balanceHidden, toggleBalanceHidden } = useWorkspaceStore();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // Sistem yazı boyutu ekran açıkken değişirse (bkz. services/reflow.ts), bu ekranın
  // yeniden mount olması için — büyük fontta bozulan (BalanceHero'nun bir kerelik ölçülen
  // pageWidth'i gibi) düzenler kullanıcı sekme değiştirmeden düzelsin.
  const reflowKey = useReflowKey();

  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces(),
    queryFn: listMyWorkspaces,
  });

  const workspaces = workspacesQuery.data ?? [];
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
  const firstWorkspaceId = workspaces[0]?.id ?? null;

  // Aktif çalışma alanı seçimi bir yan etkidir; queryFn'in içinde değil burada yapılır
  // (queryFn saf kalır, fetch sırasında store mutasyonu olmaz). Henüz seçim yoksa ve veri
  // geldiyse ilk çalışma alanı aktif edilir. `activeWorkspaceId` dolu ama bu hesabın
  // listesinde karşılığı yoksa (activeWorkspace null) da aynı şekilde düzeltilir — bu,
  // AsyncStorage'da başka bir hesaptan kalmış bir ID olduğu anlamına gelir (bkz.
  // app/_layout.tsx'teki sign-out temizliği notu); isim "—" görünmesi ve yazma denemelerinin
  // yanlışlıkla "viewer" rol mesajıyla reddedilmesi bu durumun belirtileriydi. `workspacesQuery
  // .isSuccess` şartı, veri henüz gelmeden (workspaces geçici olarak boşken) geçerli bir ID'nin
  // yanlışlıkla "geçersiz" sayılıp sıfırlanmasını önler.
  useEffect(() => {
    if (!workspacesQuery.isSuccess) return;
    if ((!activeWorkspaceId || !activeWorkspace) && firstWorkspaceId) {
      setActiveWorkspaceId(firstWorkspaceId);
    }
  }, [activeWorkspaceId, activeWorkspace, firstWorkspaceId, workspacesQuery.isSuccess, setActiveWorkspaceId]);

  // Oturum açmış ama hiç çalışma alanı olmayan kullanıcı (ör. yeni kayıt) buradan
  // onboarding'e yönlendirilir. Koşul kritik: React Query, AsyncStorage'a persist edilmiş
  // boş `[]` sonucunu ekran ilk mount olduğunda anında "success" olarak sunar; yalnızca
  // `isSuccess && length===0`'a bakmak, çalışma alanı yeni oluşturulup /(tabs)'a dönüldüğü
  // anda (henüz taze veri gelmeden) tekrar workspace-setup'a atıp sonsuz yönlendirme
  // döngüsü/çökme kuruyordu. `isFetchedAfterMount` + `!isFetching` ile yalnızca ağdan
  // gerçekten güncel ve boş sonuç geldiğinde yönlendirilir.
  useEffect(() => {
    if (
      workspacesQuery.isFetchedAfterMount &&
      !workspacesQuery.isFetching &&
      workspaces.length === 0
    ) {
      router.replace('/workspace-setup');
    }
  }, [workspacesQuery.isFetchedAfterMount, workspacesQuery.isFetching, workspaces.length]);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  // Uygulama her açıldığında (Ana Sayfa mount/hesaplar yenilendiğinde) kredi kartı
  // hesaplarının "ekstre yükle" hatırlatmaları güncel döneme göre yeniden senkronize
  // edilir — böylece aylar geçse bile bildirimler geride kalmaz (bkz. syncObligationReminder
  // ile aynı "her açılışta yeniden planla" deseni).
  useEffect(() => {
    if (!activeWorkspaceId || !accountsQuery.data) return;
    for (const account of accountsQuery.data) {
      if (account.type !== 'credit_card') continue;
      syncCreditCardStatementReminder(activeWorkspaceId, account).catch(() => {});
    }
  }, [activeWorkspaceId, accountsQuery.data]);

  const allTimeTotalsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.dashboardAllTimeTotals(activeWorkspaceId) : ['all-time', 'disabled'],
    queryFn: () => getAllTimeIncomeExpenseTotals(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const monthTotalsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.dashboardMonthTransactions(activeWorkspaceId, monthKey)
      : ['month-totals', 'disabled'],
    queryFn: () => getMonthTransactionTotals(activeWorkspaceId as string, now),
    enabled: !!activeWorkspaceId,
  });

  const activeObligationsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.dashboardActiveObligations(activeWorkspaceId) : ['obligations', 'disabled'],
    queryFn: () =>
      listObligations({ workspaceId: activeWorkspaceId as string, statuses: ACTIVE_OBLIGATION_STATUSES, pageSize: 200 }),
    enabled: !!activeWorkspaceId,
  });

  // Taksitli bir kredinin toplam bakiyesi yerine yaklaşan taksidin kendi tutarı
  // gösterilsin diye (bkz. app/(tabs)/takvim.tsx aynı desen) — kredinin toplam
  // borcu yalnızca /obligations/[id] detay sayfasında gösterilir.
  const dueInstallmentsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? [activeWorkspaceId, 'obligations', 'dashboard-installments']
      : ['dashboard-installments', 'disabled'],
    queryFn: () =>
      listInstallmentsDue({ workspaceId: activeWorkspaceId as string, statuses: ACTIVE_OBLIGATION_STATUSES, pageSize: 200 }),
    enabled: !!activeWorkspaceId,
  });

  const pendingDocumentsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.dashboardPendingDocuments(activeWorkspaceId) : ['documents', 'disabled'],
    queryFn: () => getPendingReviewDocuments(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const recentTransactionsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.recentTransactions(activeWorkspaceId) : ['transactions', 'disabled'],
    queryFn: () => listTransactions({ workspaceId: activeWorkspaceId as string, pageSize: 5 }),
    enabled: !!activeWorkspaceId,
  });

  // Hesaplar ve borç/alacak kayıtları farklı değer birimlerinde olabilir (TRY, USD,
  // gram_altin, ...) — aşağıdaki toplamlar için her kaydın güncel TL karşılığı gerekir
  // (bkz. features/valueUnits/api.ts sumToReferenceMinor).
  const valueUnitRatesQuery = useQuery({
    queryKey: queryKeys.valueUnitRates(),
    queryFn: listValueUnitRates,
  });

  const totalBalanceMinor = useMemo(() => {
    const openingSum = sumToReferenceMinor(
      (accountsQuery.data ?? []).map((a) => ({ amountMinor: a.opening_balance_minor, unitCode: a.currency_code })),
      valueUnitRatesQuery.data ?? []
    );
    // allTimeTotalsQuery zaten TL referansına çevrilmiş gelir/gider toplamlarını döner
    // (bkz. features/dashboard/api.ts getAllTimeIncomeExpenseTotals).
    const totals = allTimeTotalsQuery.data ?? { incomeMinor: 0, expenseMinor: 0 };
    return openingSum + totals.incomeMinor - totals.expenseMinor;
  }, [accountsQuery.data, allTimeTotalsQuery.data, valueUnitRatesQuery.data]);

  const monthNetMinor = useMemo(() => {
    const totals = monthTotalsQuery.data ?? { incomeMinor: 0, expenseMinor: 0 };
    return totals.incomeMinor - totals.expenseMinor;
  }, [monthTotalsQuery.data]);

  const activeObligations = useMemo<ObligationDueItem[]>(() => {
    const installmentItems = dueInstallmentsQuery.data ?? [];
    const obligationIdsWithInstallments = new Set(installmentItems.map((i) => i.id));
    const plainObligations = (activeObligationsQuery.data ?? []).filter(
      (o) => !obligationIdsWithInstallments.has(o.id)
    );
    return [...plainObligations, ...installmentItems];
  }, [activeObligationsQuery.data, dueInstallmentsQuery.data]);

  const payableObligations = useMemo(
    () => activeObligations.filter((o) => o.direction === 'payable'),
    [activeObligations]
  );
  const receivableObligations = useMemo(
    () => activeObligations.filter((o) => o.direction === 'receivable'),
    [activeObligations]
  );
  const creditCardObligation = useMemo(
    () => activeObligations.find((o) => o.document_type === 'kredi_karti_ekstresi') ?? null,
    [activeObligations]
  );

  const payableTotalMinor = useMemo(
    () =>
      sumToReferenceMinor(
        payableObligations.map((o) => ({ amountMinor: o.remaining_amount_minor, unitCode: o.currency_code })),
        valueUnitRatesQuery.data ?? []
      ),
    [payableObligations, valueUnitRatesQuery.data]
  );
  const receivableTotalMinor = useMemo(
    () =>
      sumToReferenceMinor(
        receivableObligations.map((o) => ({ amountMinor: o.remaining_amount_minor, unitCode: o.currency_code })),
        valueUnitRatesQuery.data ?? []
      ),
    [receivableObligations, valueUnitRatesQuery.data]
  );

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      {!workspacesQuery.isSuccess || workspaces.length === 0 ? (
        <Stack gap="lg" style={{ padding: theme.screenEdge.standard }}>
          <Skeleton height={32} width="60%" />
          <Skeleton height={180} borderRadius={theme.radius.heroWidget} />
          <Skeleton height={100} borderRadius={theme.radius.widget} />
          <Skeleton height={100} borderRadius={theme.radius.widget} />
        </Stack>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: theme.screenEdge.standard,
            // Kayan tab bar'ın altında kalmasın diye normalden fazla alt boşluk
            // (bkz. TabBar.tsx: mutlak konumlu, ~64+inset yükseklik).
            paddingBottom: theme.layout.tabBarClearance,
            gap: theme.spacing.lg,
          }}
        >
          <Stack gap="xs">
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Pressable
                onPress={() => workspaces.length > 1 && setSwitcherOpen((open) => !open)}
                disabled={workspaces.length <= 1}
              >
                <Row gap="xs" align="center">
                  <Text variant="caption" color="textSecondary">
                    ÇALIŞMA ALANI
                  </Text>
                  {workspaces.length > 1 ? (
                    <Ionicons
                      name={switcherOpen ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={theme.colors.textSecondary}
                    />
                  ) : null}
                </Row>
                <Text variant="pageTitle">{activeWorkspace?.name ?? '—'}</Text>
              </Pressable>
              <Row gap="xs">
                <Pressable
                  onPress={() => router.push('/notifications')}
                  hitSlop={12}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: theme.radius.input,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Ionicons name="notifications-outline" size={22} color={theme.colors.textSecondary} />
                </Pressable>
                <Pressable
                  onPress={() => router.push('/settings')}
                  hitSlop={12}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: theme.radius.input,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Ionicons name="settings-outline" size={22} color={theme.colors.textSecondary} />
                </Pressable>
              </Row>
            </Row>
            {switcherOpen ? (
              <Stack
                gap="xxs"
                style={{ backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.widget, padding: theme.spacing.xs }}
              >
                {workspaces.map((w) => (
                  <Pressable
                    key={w.id}
                    onPress={() => {
                      setActiveWorkspaceId(w.id);
                      setSwitcherOpen(false);
                    }}
                    style={{ padding: theme.spacing.sm }}
                  >
                    <Text variant="body" color={w.id === activeWorkspaceId ? 'brandPrimary' : 'textPrimary'}>
                      {w.name}
                    </Text>
                  </Pressable>
                ))}
              </Stack>
            ) : null}
          </Stack>

          {/* Borç/Alacak özeti ile Bu Ay Gelir-Gider artık ayrı kartlarda tekrarlanmıyor —
              hero'nun kendi iki sayfası (sağa kaydırarak geçilir) bu ikisini gösteriyor. */}
          <BalanceHero
            totalBalanceMinor={totalBalanceMinor}
            monthNetMinor={monthNetMinor}
            monthIncomeMinor={monthTotalsQuery.data?.incomeMinor ?? 0}
            monthExpenseMinor={monthTotalsQuery.data?.expenseMinor ?? 0}
            receivableMinor={receivableTotalMinor}
            payableMinor={payableTotalMinor}
            hidden={balanceHidden}
            onToggleHidden={toggleBalanceHidden}
          />

          <QuickActions />

          <UpcomingDueList obligations={activeObligations} />

          <PendingReviewQueue documents={pendingDocumentsQuery.data ?? []} />

          <CreditCardDueWidget obligation={creditCardObligation} />

          {/* Hesaplar/Kişiler/Kategoriler artık "Daha Fazla" sekmesinden erişiliyor. */}
          <RecentTransactionsList transactions={recentTransactionsQuery.data ?? []} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
