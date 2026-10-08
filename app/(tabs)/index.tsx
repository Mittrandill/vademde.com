import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { PAYWALL_LAST_SHOWN_KEY } from '@/utils/storageKeys';

import { useTheme } from '@/theme';
import { Pressable, Row, Skeleton, Stack, Text } from '@/components/primitives';
import { HomeHero } from '@/components/finance/HomeHero';
import { AiInsightsCard } from '@/components/finance/AiInsightsCard';
import { CashAlertBanner } from '@/components/finance/CashAlertBanner';
import { QuickActions } from '@/components/finance/QuickActions';
import { UpcomingDueList } from '@/components/finance/UpcomingDueList';
import { PendingReviewQueue } from '@/components/finance/PendingReviewQueue';
import { DraftDocumentsQueue } from '@/components/finance/DraftDocumentsQueue';
import { CreditCardDueWidget } from '@/components/finance/CreditCardDueWidget';
import { RecentTransactionsList } from '@/components/finance/RecentTransactionsList';
import { listMyWorkspaces } from '@/features/workspaces/api';
import { listAccounts } from '@/features/accounts/api';
import {
  listObligations,
  listInstallmentsDue,
  ACTIVE_OBLIGATION_STATUSES,
  getDueBreakdown,
  type ObligationDueItem,
} from '@/features/obligations/api';
import { listTransactions } from '@/features/transactions/api';
import { getAccountBalances } from '@/features/reports/api';
import { getMonthTransactionTotals, getPendingReviewDocuments } from '@/features/dashboard/api';
import { getMySubscription } from '@/features/subscriptions/api';
import { usePlanEnforcement } from '@/features/subscriptions/usePlanEnforcement';
import { PlanLimitBanner } from '@/components/subscription/PlanLimitBanner';
import { listValueUnitRates, sumToReferenceMinor } from '@/features/valueUnits/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { syncCreditCardStatementReminder } from '@/services/creditCardReminders';
import { useReflowKey } from '@/services/reflow';

// Ücretsiz plandaki kullanıcıya ilk açılışta ve sonrasında en fazla 5 günde bir kez
// gösterilen yumuşak paywall hatırlatması (kullanıcı kararı — Dashboard'da başka bir
// yükseltme çağrısı yok). Ücretli kullanıcıya hiç gösterilmez.
const PAYWALL_REMINDER_INTERVAL_MS = 5 * 24 * 60 * 60 * 1000;

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

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.subscription(),
    queryFn: getMySubscription,
  });
  // Plan limiti durumu. Bu sorgu aynı zamanda sunucuda limit aşımını ilk gördüğünde
  // 14 günlük lütuf süresini başlatır (sync_plan_enforcement) — bu yüzden uygulamanın
  // ilk açılan ekranında çağrılır: kullanıcı uyarıyı görmeden kilit devreye girmez.
  const planEnforcementQuery = usePlanEnforcement();

  const paywallCheckedRef = useRef(false);
  useEffect(() => {
    if (paywallCheckedRef.current || !subscriptionQuery.isSuccess) return;
    if ((subscriptionQuery.data?.plan ?? 'free') !== 'free') return;
    paywallCheckedRef.current = true;
    AsyncStorage.getItem(PAYWALL_LAST_SHOWN_KEY).then((value) => {
      const lastShownAt = value ? Number(value) : 0;
      if (Date.now() - lastShownAt < PAYWALL_REMINDER_INTERVAL_MS) return;
      AsyncStorage.setItem(PAYWALL_LAST_SHOWN_KEY, String(Date.now())).catch(() => {});
      router.push('/paywall');
    });
  }, [subscriptionQuery.isSuccess, subscriptionQuery.data]);

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

  // app/accounts/index.tsx'teki aynı desen: kredi kartı hariç, çünkü kart borcu
  // (artık doğru işaretle) ayrıca kart hesabında takip ediliyor — nakit/banka
  // bakiyeleriyle karışırsa toplam bakiye anlamsızlaşır.
  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'account-balances'] : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const monthTotalsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.dashboardMonthTransactions(activeWorkspaceId, monthKey)
      : ['month-totals', 'disabled'],
    queryFn: () => getMonthTransactionTotals(activeWorkspaceId as string, now),
    enabled: !!activeWorkspaceId,
  });

  // Borcun/alacağın "gecikmiş / bu ay / toplam kalan" kırılımı (docs/01 §3.2.1). Hero'daki
  // tek toplam rakamı, tekrarlayan kayıtlarda tek başına yanıltıcı kaldığı için hemen
  // altında bu üç kırılım gösterilir.
  const dueBreakdownQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.dueBreakdown(activeWorkspaceId, 'all')
      : ['due-breakdown', 'disabled'],
    queryFn: () => getDueBreakdown({ workspaceId: activeWorkspaceId as string }),
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
    const balanceByAccountId = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b.balanceMinor]));
    return sumToReferenceMinor(
      (accountsQuery.data ?? [])
        .filter((a) => a.type !== 'credit_card')
        .map((a) => ({
          amountMinor: balanceByAccountId.get(a.id) ?? a.opening_balance_minor,
          unitCode: a.currency_code,
        })),
      valueUnitRatesQuery.data ?? []
    );
  }, [accountsQuery.data, balancesQuery.data, valueUnitRatesQuery.data]);

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
  // Her kredi kartı ekstresi için en yakın vadeli kayıt (taksit satırları tekilleştirilir).
  const creditCardObligations = useMemo(() => {
    const nearest = new Map<string, ObligationDueItem>();
    for (const o of activeObligations) {
      if (o.document_type !== 'kredi_karti_ekstresi' || o.remaining_amount_minor <= 0) continue;
      const current = nearest.get(o.id);
      if (!current || (o.due_date ?? '9999') < (current.due_date ?? '9999')) nearest.set(o.id, o);
    }
    return [...nearest.values()].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  }, [activeObligations]);


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
            gap: 20,
          }}
        >
          <Stack gap="xs">
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Çalışma alanını değiştir"
                onPress={() => workspaces.length > 1 && setSwitcherOpen((open) => !open)}
                disabled={workspaces.length <= 1}
                style={{ flex: 1, gap: 2 }}
              >
                <Text variant="caption" color="textSecondary">
                  Çalışma alanı
                </Text>
                <Row gap="xs" align="center">
                  <Text numberOfLines={1} style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.56, flexShrink: 1 }}>
                    {activeWorkspace?.name ?? '—'}
                  </Text>
                  {workspaces.length > 1 ? (
                    <Ionicons name={switcherOpen ? 'chevron-up' : 'chevron-down'} size={19} color={theme.colors.textSecondary} />
                  ) : null}
                </Row>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Bildirimler"
                onPress={() => router.push('/notifications')}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.fill,
                }}
              >
                <Ionicons name="notifications" size={19} color={theme.colors.textPrimary} />
              </Pressable>
            </Row>
            {switcherOpen ? (
              <Stack
                gap="xxs"
                style={{ backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.group, padding: theme.spacing.xs }}
              >
                {workspaces.map((w) => (
                  <Pressable
                    key={w.id}
                    onPress={() => {
                      setActiveWorkspaceId(w.id);
                      setSwitcherOpen(false);
                    }}
                    style={{ padding: theme.spacing.sm, minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text style={{ fontWeight: w.id === activeWorkspaceId ? '700' : '400' }}>{w.name}</Text>
                  </Pressable>
                ))}
              </Stack>
            ) : null}
          </Stack>

          {/* Borç/Alacak özeti ile Bu Ay Gelir-Gider artık ayrı kartlarda tekrarlanmıyor —
              hero'nun kendi iki sayfası (sağa kaydırarak geçilir) bu ikisini gösteriyor. */}
          <PlanLimitBanner state={planEnforcementQuery.data} />

          <HomeHero
            totalBalanceMinor={totalBalanceMinor}
            monthNetMinor={monthNetMinor}
            receivableMinor={receivableTotalMinor}
            payableMinor={payableTotalMinor}
            overdueMinor={dueBreakdownQuery.data?.payable.overdueMinor ?? 0}
            overdueCount={dueBreakdownQuery.data?.payable.overdueCount ?? 0}
            hidden={balanceHidden}
            onToggleHidden={toggleBalanceHidden}
          />

          <CashAlertBanner />

          <QuickActions />

          <UpcomingDueList obligations={activeObligations} />

          <PendingReviewQueue documents={pendingDocumentsQuery.data ?? []} />

          {activeWorkspaceId ? <DraftDocumentsQueue workspaceId={activeWorkspaceId} /> : null}

          <CreditCardDueWidget obligations={creditCardObligations} />

          <AiInsightsCard />

          {/* Hesaplar/Kişiler/Kategoriler artık "Daha Fazla" sekmesinden erişiliyor. */}
          <RecentTransactionsList transactions={recentTransactionsQuery.data ?? []} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
