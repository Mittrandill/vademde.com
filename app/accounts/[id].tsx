import { useState } from 'react';
import { Alert, InteractionManager, Modal, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import {
  ActionSheet,
  Button,
  Card,
  Divider,
  EmptyState,
  Group,
  GroupedRow,
  GroupedRowIcon,
  Pagination,
  Pressable,
  Row,
  SectionHeader,
  Stack,
  Tag,
  Text,
} from '@/components/primitives';
import { DetailScaffold } from '@/components/navigation/DetailScaffold';
import {
  FinanceDetailHero,
  FinanceDetailInfoCard,
  FinanceDetailTabs,
} from '@/components/finance/FinanceDetailBlocks';
import { Amount } from '@/components/finance/Amount';
import { ReferenceValueRow } from '@/components/finance/ReferenceValueRow';
import { BankLogo } from '@/components/finance/BankLogo';
import { ValueUnitBadge } from '@/components/finance/ValueUnitPicker';
import { CardPaymentForm } from '@/components/finance/CardPaymentForm';
import { archiveAccount, getAccount, listAccounts, type Account } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { listObligations, type ObligationWithRelations } from '@/features/obligations/api';
import {
  listCardInstallmentPurchases,
  pendingInstallmentMinor,
  progressOf,
} from '@/features/cardInstallments/api';
import { listTransactions, type TransactionWithRelations } from '@/features/transactions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { maskIban } from '@/utils/iban';
import { BANK_NAME } from '@/features/banks/banks';
import { formatMinorAmount } from '@/utils/money';
import { getValueUnit } from '@/features/valueUnits/units';
import { queryKeys } from '@/services/queryKeys';
import { showSaveSuccess, showSuccessAlert, showErrorAlert } from '@/utils/alerts';
import { groupByDay } from '@/utils/groupByDay';
import { computeStatementPeriod, periodKeyFor, periodKeyForDueDate } from '@/utils/creditCardPeriod';
import type { ValueUnitType } from '@/features/valueUnits/units';
import { listValueUnitRates } from '@/features/valueUnits/api';

const TYPE_ICON: Record<Account['type'], keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline',
  bank: 'business-outline',
  wallet: 'wallet-outline',
  credit_card: 'card-outline',
  pos: 'storefront-outline',
};

const TYPE_LABEL: Record<Account['type'], string> = {
  cash: 'Kasa',
  bank: 'Banka',
  wallet: 'Cüzdan',
  credit_card: 'Kredi Kartı',
  pos: 'POS',
};

const PAGE_SIZE = 10;

const monthFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });
const dueDayFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const shortDayFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

type CreditCardTab = 'genel' | 'ekstreler' | 'taksitler' | 'hareketler';
type AccountTab = 'hareketler' | 'bilgiler' | 'kmh';

interface StatementMonth {
  periodKey: string;
  monthDate: Date;
  /** Bu dönem için beklenen son ödeme tarihi (statement_day/payment_due_day'den hesaplanır) —
   * yeni bir ekstre eklenirken tarih alanını akıllıca doldurmak için kullanılır. */
  dueDate: Date | null;
  obligation: ObligationWithRelations | null;
}

export default function AccountDetailScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { id, pay } = useLocalSearchParams<{ id: string; pay?: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [page, setPage] = useState(0);
  // Yalnızca kredi kartı hesabında kullanılır (bkz. aşağıdaki kredi kartı dalı) —
  // hook sırası bozulmasın diye diğer hesap türlerinde de koşulsuz çağrılır.
  const [tab, setTab] = useState<CreditCardTab>('ekstreler');
  // Kredi kartı dışındaki hesaplar: Hareketler / Hesap bilgileri / Ek hesap (KMH) sekmeleri.
  const [accountTab, setAccountTab] = useState<AccountTab>('hareketler');
  const [menuOpen, setMenuOpen] = useState(false);
  const [statementSheetMonth, setStatementSheetMonth] = useState<StatementMonth | null>(null);
  // ?pay=1 ile gelinirse (kart listesi, hatırlatma) kart borcu ödeme formu doğrudan açılır.
  const [payingCard, setPayingCard] = useState(pay === '1');

  const accountQuery = useQuery({
    queryKey: ['account', id],
    queryFn: () => getAccount(id as string),
    enabled: !!id,
  });

  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'account-balances'] : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  // Kart ödemesi (CardPaymentForm) için kaynak hesap seçenekleri — bkz. aşağıdaki
  // sourceAccounts: kredi kartı ve POS hariç (bir kartın borcu başka bir kartla ödenemez,
  // aynı gerekçe app/obligations/[id].tsx isCardStatementPayment'ta).
  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  // docs/01-finansal-kayit-modeli.md §3.5 — yalnızca kasa hesapları TRY dışı bir değer
  // biriminde tutulabilir (bkz. app/accounts/new.tsx isCash koşulu); diğer hesap türleri
  // her zaman TRY olduğundan kur sorgusu yalnızca gerektiğinde açılır (bkz. obligations/[id]
  // ile aynı desen — components/finance/ReferenceValueRow.tsx).
  const isNonTryCash = accountQuery.data?.type === 'cash' && accountQuery.data.currency_code !== 'TRY';
  const ratesQuery = useQuery({
    queryKey: queryKeys.valueUnitRates(),
    queryFn: listValueUnitRates,
    enabled: isNonTryCash,
  });

  const transactionsQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'transactions', 'account', id] : ['transactions', 'disabled'],
    queryFn: () => listTransactions({ workspaceId: activeWorkspaceId as string, accountId: id as string }),
    enabled: !!activeWorkspaceId && !!id,
  });

  const allTransactions = transactionsQuery.data ?? [];
  const totalPages = Math.max(1, Math.ceil(allTransactions.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages - 1);
  const pagedTransactions = allTransactions.slice(effectivePage * PAGE_SIZE, effectivePage * PAGE_SIZE + PAGE_SIZE);
  const sections = groupByDay(pagedTransactions, (item) => item.occurred_at);

  // Kredi kartı hesabında "ay ay ekstre yüklendi mi" özeti — hesap kesiminden sonra
  // oluşturulan her kredi_karti_ekstresi obligation'ı ilgili aya (due_date) eşler.
  const isCreditCardAccount = accountQuery.data?.type === 'credit_card';
  const statementsQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'obligations', 'account-statements', id] : ['account-statements', 'disabled'],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        accountId: id as string,
        documentType: 'kredi_karti_ekstresi',
        pageSize: 24,
        ascending: false,
      }),
    enabled: !!activeWorkspaceId && !!id && isCreditCardAccount,
  });

  // Taksitli alışverişler (card_installment_purchases) — kart detayında "Taksitler" sekmesi ve
  // özet kartındaki "Taksitte kalan" bu sorgudan beslenir.
  const purchasesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'card-installments', id] : ['card-installments', 'disabled'],
    queryFn: () => listCardInstallmentPurchases(activeWorkspaceId as string, id as string),
    enabled: !!activeWorkspaceId && !!id && isCreditCardAccount,
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveAccount(id as string),
    onSuccess: () => {
      showSaveSuccess('Hesap başarıyla arşivlendi.', () => router.back(), () => {
        if (activeWorkspaceId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.accounts(activeWorkspaceId) });
          queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'account-balances'] });
        }
        queryClient.removeQueries({ queryKey: ['account', id] });
      });
    },
    onError: (error) => showErrorAlert(error),
  });

  function confirmArchive() {
    Alert.alert('Hesabı Arşivle', 'Bu hesap listeden kaldırılacak, geçmiş hareketleri korunur. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Arşivle', style: 'destructive', onPress: () => archiveMutation.mutate() },
    ]);
  }

  if (accountQuery.isLoading || !accountQuery.data) {
    return (
      <DetailScaffold
        header={{ title: '' }}
        isLoading
        error={accountQuery.error}
        errorFallbackMessage="Hesap yüklenemedi"
      >
        {null}
      </DetailScaffold>
    );
  }

  const account = accountQuery.data;
  const type = account.type as Account['type'];
  const balanceItem = balancesQuery.data?.find((b) => b.accountId === account.id);
  const balanceMinor = balanceItem?.balanceMinor ?? account.opening_balance_minor;
  // Kredi kartında güncel borcun dayandığı en son ekstre (bkz. utils/cardDebt.ts).
  const cardStatement = balanceItem?.cardStatement ?? null;
  const overdraftLimitMinor = account.overdraft_limit_minor ?? 0;
  const hasOverdraft = type === 'bank' && overdraftLimitMinor > 0;

  // Son 6 ay (bu ay dahil): her biri için o KESİM ayına ait bir ekstre (obligation) var
  // mı diye bakılır — varsa borç tutarıyla birlikte gösterilir ve dokununca o ekstrenin
  // detayına (obligations/[id]) gidilir, yoksa "Yüklenmedi" rozeti (artık dokunulabilir).
  // Dönem, obligation'ın due_date'inin kendi ayı DEĞİL, o due_date'in periodKeyForDueDate
  // ile geriye doğru eşlendiği kesim ayıdır — son ödeme tarihi sıklıkla bir sonraki aya
  // sarktığı için (bkz. utils/creditCardPeriod.ts) ham due_date ayına bakmak yanlış olurdu.
  const statementMonths: StatementMonth[] = isCreditCardAccount
    ? Array.from({ length: 6 }, (_, i) => {
        const now = new Date();
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const period = computeStatementPeriod(account, monthDate);
        const periodKey = period?.periodKey ?? periodKeyFor(monthDate);
        const obligation =
          (statementsQuery.data ?? []).find((o) => o.due_date && periodKeyForDueDate(account, o.due_date) === periodKey) ??
          null;
        return { periodKey, monthDate, dueDate: period?.dueDate ?? null, obligation };
      })
    : [];
  const mostRecentUnfulfilled = statementMonths.find((m) => !m.obligation);

  // Ekran web'de doğrudan bu URL'e gidilerek (sayfa yenileme, deep link) açılırsa
  // stack'te geri gidilecek bir geçmiş olmayabilir — o durumda hesabın türüne uygun
  // listeye düşülür (credit-cards.tsx'teki aynı korumaya bkz.).
  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(isCreditCardAccount ? '/accounts/credit-cards' : '/accounts');
    }
  }

  if (isCreditCardAccount) {
    // Kredi/çek/senet detaylarıyla aynı ortak hero + sekme + bilgi kartı deseni.
    const hasLimit = (account.credit_limit_minor ?? 0) > 0;
    // Banka, henüz ekstreye girmemiş taksitleri de limitten düşer.
    const pendingInstallmentsMinor = pendingInstallmentMinor(purchasesQuery.data ?? [], cardStatement?.cutoffDate ?? null);
    const usedMinor = balanceMinor + pendingInstallmentsMinor;
    const utilization = hasLimit ? usedMinor / (account.credit_limit_minor as number) : 0;
    const clampedUtilization = Math.max(0, Math.min(1, utilization));
    const availableMinor = hasLimit ? Math.max(0, (account.credit_limit_minor as number) - usedMinor) : 0;
    // Ekstre borcu: en son ekstreden ödenmesi gereken kalan. Ekstre yoksa gösterilmez.
    const statementDebtMinor = cardStatement ? cardStatement.statementRemainingMinor : null;
    const stateAccent =
      balanceMinor <= 0 ? theme.colors.success : clampedUtilization >= 0.9 ? theme.colors.danger : theme.colors.brandPrimary;
    const loadedStatementCount = statementMonths.filter((m) => m.obligation).length;
    const sourceAccounts = (accountsQuery.data ?? []).filter(
      (a) => a.type !== 'credit_card' && a.type !== 'pos' && a.currency_code === account.currency_code
    );

    function afterCardPayment() {
      InteractionManager.runAfterInteractions(() => {
        if (activeWorkspaceId) {
          queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'account-balances'] });
          queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'obligations'] });
          queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'transactions'] });
        }
      });
    }

    const purchaseProgress = (purchasesQuery.data ?? []).map((p) => progressOf(p));
    const activePurchases = purchaseProgress.filter((p) => p.elapsedStatementCount < p.purchase.installment_count);

    const tabOptions: { key: CreditCardTab; label: string }[] = [
      { key: 'ekstreler', label: `Ekstreler (${loadedStatementCount})` },
      { key: 'taksitler', label: `Taksitler (${activePurchases.length})` },
      { key: 'hareketler', label: 'Hareketler' },
      { key: 'genel', label: 'Kart bilgileri' },
    ];
    // Son ödeme: ödenmemiş bir ekstre varsa onun son ödeme tarihi, yoksa kartın bir sonraki dönemi.
    const nextDue =
      cardStatement && cardStatement.statementRemainingMinor > 0
        ? new Date(`${cardStatement.dueDate}T12:00:00`)
        : (computeStatementPeriod(account, new Date())?.dueDate ?? null);
    const daysLeft = nextDue ? Math.ceil((nextDue.getTime() - new Date().getTime()) / 86400000) : null;

    return (
      <>
      <DetailScaffold
        header={{
          title: account.name,
          left: { icon: 'chevron-back', accessibilityLabel: 'Geri', onPress: goBack },
          right: {
            icon: 'ellipsis-horizontal',
            accessibilityLabel: 'Kart işlemleri',
            onPress: () => setMenuOpen(true),
          },
        }}
        isLoading={false}
      >
        {/* Kredi detayıyla aynı üst yapı: simge + ad satırı, ardından tek kart (ana tutar, ilerleme çubuğu, üç özet sütunu). */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BankLogo bankCode={account.bank_code} fallbackIcon="card-outline" size={56} />
          <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
            <Text variant="sectionTitle" numberOfLines={2}>
              {account.name}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {[
                account.bank_code ? (BANK_NAME[account.bank_code] ?? null) : null,
                'Kredi Kartı',
                account.card_last_four ? `•••• ${account.card_last_four}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Stack>
        </View>

        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="caption" color="textSecondary">
                Güncel borç
              </Text>
              <Text
                tabular
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', color: daysLeft !== null && daysLeft < 0 && balanceMinor > 0 ? theme.colors.danger : theme.colors.textPrimary }}
              >
                {formatMinorAmount(balanceMinor, account.currency_code)}
              </Text>
            </Stack>
            {hasLimit ? (
              <Stack gap="xxs" style={{ alignItems: 'flex-end' }}>
                <Text variant="caption" color="textSecondary">
                  Limit
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '600' }} tabular>
                  {formatMinorAmount(account.credit_limit_minor as number, account.currency_code)}
                </Text>
              </Stack>
            ) : null}
          </View>
          {hasLimit ? (
            <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.colors.fill, overflow: 'hidden' }}>
              <View style={{ width: `${clampedUtilization * 100}%`, height: 8, borderRadius: 4, backgroundColor: stateAccent }} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row' }}>
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="caption" color="textSecondary">
                Kullanılabilir
              </Text>
              <Text tabular style={{ fontSize: 15, fontWeight: '600' }}>
                {hasLimit ? formatMinorAmount(availableMinor, account.currency_code) : 'Yok'}
              </Text>
            </Stack>
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="caption" color="textSecondary">
                Ekstre borcu
              </Text>
              <Text tabular style={{ fontSize: 15, fontWeight: '600' }}>
                {statementDebtMinor !== null ? formatMinorAmount(statementDebtMinor, account.currency_code) : 'Ekstre yok'}
              </Text>
            </Stack>
            <Stack gap="xxs" style={{ alignItems: 'flex-end' }}>
              <Text variant="caption" color="textSecondary">
                Son ödeme
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '600' }}>
                {nextDue ? dueDayFormatter.format(nextDue) : account.payment_due_day ? `Ayın ${account.payment_due_day}.` : 'Yok'}
                {nextDue && daysLeft !== null && balanceMinor > 0 ? ` · ${daysLeft < 0 ? 'gecikti' : `${daysLeft} gün`}` : ''}
              </Text>
            </Stack>
          </View>
          {pendingInstallmentsMinor > 0 || cardStatement ? (
            <Text variant="caption" color="textSecondary">
              {[
                cardStatement
                  ? `Güncel borç ${cardStatement.cutoffEstimated ? 'yaklaşık ' : ''}${shortDayFormatter.format(new Date(`${cardStatement.cutoffDate}T12:00:00`))} kesimli ekstreden hesaplandı: sonraki harcamalar eklendi, ödemeler düşüldü.`
                  : null,
                cardStatement?.cutoffEstimated ? 'Kesin tarih için Kart bilgilerinden kesim gününü girin.' : null,
                pendingInstallmentsMinor > 0
                  ? `Ekstreye henüz girmemiş ${formatMinorAmount(pendingInstallmentsMinor, account.currency_code)} taksit limitten düşüldü.`
                  : null,
              ]
                .filter(Boolean)
                .join(' ')}
            </Text>
          ) : null}
        </Card>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button label="Kart borcunu öde" size="compact" onPress={() => setPayingCard(true)} disabled={balanceMinor <= 0} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Ekstre tara"
              variant="secondary"
              size="compact"
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/tara',
                  params: { accountId: account.id, documentType: 'kredi_karti_ekstresi' },
                })
              }
            />
          </View>
        </View>

        <FinanceDetailTabs options={tabOptions} value={tab} onChange={setTab} />

        {tab === 'genel' ? (
          <FinanceDetailInfoCard
            title="Kart Bilgileri"
            description="Kart, dönem ve limit ayrıntıları"
            rows={[
              { label: 'Kart No', value: `•••• ${account.card_last_four ?? '····'}` },
              { label: 'Kesim Günü', value: account.statement_day ? `Her ayın ${account.statement_day}.` : 'Yok' },
              { label: 'Son Ödeme Günü', value: account.payment_due_day ? `Her ayın ${account.payment_due_day}.` : 'Yok' },
              ...(hasLimit
                ? [{ label: 'Kredi Limiti', value: formatMinorAmount(account.credit_limit_minor as number, account.currency_code) }]
                : []),
            ]}
          />
        ) : tab === 'taksitler' ? (
          <Stack gap="md">
            {purchaseProgress.length === 0 ? (
              <EmptyState
                icon="layers-outline"
                message="Bu karta eklenmiş taksitli alışveriş yok."
                actionLabel="Alışveriş ekle"
                onActionPress={() => router.push(`/accounts/${account.id}/installments`)}
              />
            ) : (
              <>
                <Group>
                  {purchaseProgress.map((p) => (
                    <GroupedRow
                      key={p.purchase.id}
                      leading={<GroupedRowIcon name="layers" tone="brandSoft" />}
                      title={p.purchase.merchant}
                      subtitle={`${p.elapsedStatementCount}/${p.purchase.installment_count} dönem geçti · aylık ${formatMinorAmount(p.monthlyMinor, account.currency_code)}`}
                      chevron={false}
                      trailing={
                        <Text tabular style={{ fontSize: 15, fontWeight: '600' }}>
                          {formatMinorAmount(p.futureStatementMinor, account.currency_code)}
                        </Text>
                      }
                    />
                  ))}
                </Group>
                <Button
                  label="Taksit yükü ve alışveriş ekle"
                  variant="secondary"
                  size="compact"
                  onPress={() => router.push(`/accounts/${account.id}/installments`)}
                />
              </>
            )}
          </Stack>
        ) : tab === 'ekstreler' ? (
          <Group>
            {statementMonths.map((m) => {
              const monthLabel = monthFormatter.format(m.monthDate);
              const o = m.obligation;
              const paid = o ? o.remaining_amount_minor <= 0 : false;
              return (
                <GroupedRow
                  key={m.periodKey}
                  leading={<GroupedRowIcon name={paid ? 'checkmark' : 'document-text'} tone={paid ? 'success' : o ? 'brandSoft' : 'default'} />}
                  title={monthLabel.charAt(0).toLocaleUpperCase('tr-TR') + monthLabel.slice(1)}
                  subtitle={o?.due_date ? `Son ödeme ${dueDayFormatter.format(new Date(o.due_date))}` : undefined}
                  chevron={false}
                  trailing={
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      {o ? (
                        <Text tabular style={{ fontSize: 15, fontWeight: '600' }}>
                          {formatMinorAmount(o.total_amount_minor, o.currency_code)}
                        </Text>
                      ) : null}
                      <Tag label={paid ? 'Ödendi' : o ? 'Bekliyor' : 'Yüklenmedi'} tone={paid ? 'success' : o ? 'brand' : 'neutral'} />
                    </View>
                  }
                  onPress={() => (o ? router.push(`/obligations/${o.id}`) : setStatementSheetMonth(m))}
                />
              );
            })}
          </Group>
        ) : (
          <Stack gap="md">
            {sections.length === 0 ? (
              <EmptyState icon="receipt-outline" message="Bu hesapta henüz hareket yok." />
            ) : (
              <Stack gap="md">
                {sections.map((section) => (
                  <Stack gap="xs" key={section.title}>
                    <SectionHeader title={section.title} />
                    <Group>
                      {section.data.map((item) => (
                        <TransactionRow key={item.id} item={item} accountId={account.id} />
                      ))}
                    </Group>
                  </Stack>
                ))}
              </Stack>
            )}
            {totalPages > 1 ? <Pagination page={effectivePage} totalPages={totalPages} onChange={setPage} /> : null}
          </Stack>
        )}

      </DetailScaffold>

      <ActionSheet
        visible={menuOpen}
        title="Kart işlemleri"
        onClose={() => setMenuOpen(false)}
        options={[
          ...(balanceMinor > 0
            ? [
                {
                  key: 'pay',
                  label: 'Ödeme Ekle',
                  description: 'Kart borcuna ödeme işleyin.',
                  icon: 'cash-outline' as const,
                  onPress: () => setPayingCard(true),
                },
              ]
            : []),
          ...(mostRecentUnfulfilled
            ? [
                {
                  key: 'statement',
                  label: 'Ekstre Ekle',
                  description: `${monthFormatter.format(mostRecentUnfulfilled.monthDate)} dönemini ekleyin.`,
                  icon: 'add-circle-outline' as const,
                  onPress: () => setStatementSheetMonth(mostRecentUnfulfilled),
                },
              ]
            : []),
          {
            key: 'installments',
            label: 'Taksitli Alışverişler',
            description: 'Gelecek ekstrelere yansıyan taksit yükü.',
            icon: 'layers-outline' as const,
            onPress: () => router.push(`/accounts/${account.id}/installments`),
          },
          {
            key: 'edit',
            label: 'Düzenle',
            description: 'Kart bilgilerini güncelleyin.',
            icon: 'create-outline',
            onPress: () => router.push({ pathname: '/accounts/new', params: { id: account.id } }),
          },
          {
            key: 'archive',
            label: 'Arşivle',
            description: 'Kartı listeden kaldırın; geçmiş hareketler korunsun.',
            icon: 'archive-outline',
            danger: true,
            onPress: confirmArchive,
          },
        ]}
      />

      <Modal
        visible={payingCard}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPayingCard(false)}
      >
        {payingCard && activeWorkspaceId ? (
          <CardPaymentForm
            workspaceId={activeWorkspaceId}
            cardAccountId={account.id}
            cardAccountName={account.name}
            cardAccount={account}
            currencyCode={account.currency_code}
            currentDebtMinor={balanceMinor}
            statementDebtMinor={cardStatement?.statementRemainingMinor ?? null}
            sourceAccounts={sourceAccounts}
            onClose={() => setPayingCard(false)}
            onSuccess={() => {
              showSuccessAlert('Ödeme başarıyla kaydedildi.', () => {
                setPayingCard(false);
                afterCardPayment();
              });
            }}
          />
        ) : null}
      </Modal>

      {statementSheetMonth ? (
        <ActionSheet
          visible
          title={`${monthFormatter.format(statementSheetMonth.monthDate)} Ekstresi Ekle`}
          onClose={() => setStatementSheetMonth(null)}
          options={[
            {
              key: 'scan',
              label: 'Kameradan/Galeriden Tara',
              description: 'OCR belgeyi okur; hesap ve dönem otomatik eşlenir.',
              icon: 'camera-outline',
              onPress: () =>
                router.push({
                  pathname: '/(tabs)/tara',
                  params: {
                    accountId: account.id,
                    documentType: 'kredi_karti_ekstresi',
                    ...(statementSheetMonth.dueDate ? { expectedDueDate: toIsoDate(statementSheetMonth.dueDate) } : {}),
                  },
                }),
            },
            {
              key: 'manual',
              label: 'Manuel Gir',
              description: 'Tutar ve vadeyi elle girin.',
              icon: 'create-outline',
              onPress: () =>
                router.push({
                  pathname: '/obligations/new',
                  params: {
                    type: 'kredi_karti_ekstresi',
                    accountId: account.id,
                    ...(statementSheetMonth.dueDate ? { dueDate: toIsoDate(statementSheetMonth.dueDate) } : {}),
                  },
                }),
            },
          ]}
        />
      ) : null}
      </>
    );
  }

  const accountInfoRows = [
    { label: 'Hesap Türü', value: TYPE_LABEL[type] },
    { label: 'Para Birimi', value: getValueUnit(account.currency_code).name },
    ...(account.iban ? [{ label: 'IBAN', value: maskIban(account.iban) }] : []),
    { label: 'Açılış Bakiyesi', value: formatMinorAmount(account.opening_balance_minor, account.currency_code) },
    ...(hasOverdraft
      ? [{ label: 'Ek Hesap Limiti', value: formatMinorAmount(overdraftLimitMinor, account.currency_code) }]
      : []),
    ...(type === 'pos'
      ? [{ label: 'POS Komisyonu', value: account.pos_commission_rate != null ? `%${account.pos_commission_rate}` : 'Girilmedi' }]
      : []),
  ];
  // Ek hesap sekmesi yalnızca banka hesabında anlamlıdır (kasa, cüzdan ve POS'ta KMH olmaz).
  const accountTabs: { key: AccountTab; label: string }[] = [
    { key: 'hareketler', label: `Hareketler (${allTransactions.length})` },
    { key: 'bilgiler', label: 'Hesap bilgileri' },
    ...(type === 'bank' ? [{ key: 'kmh' as const, label: 'Ek hesap (KMH)' }] : []),
  ];
  const activeAccountTab: AccountTab = accountTabs.some((t) => t.key === accountTab) ? accountTab : 'hareketler';
  return (
    <>
      <DetailScaffold
        header={{
          title: account.name,
          left: { icon: 'chevron-back', accessibilityLabel: 'Geri', onPress: goBack },
          right: {
            icon: 'ellipsis-horizontal',
            accessibilityLabel: 'Hesap işlemleri',
            onPress: () => setMenuOpen(true),
          },
        }}
        isLoading={false}
      >
        <Stack gap="xs" style={{ alignItems: 'center' }}>
          {type === 'cash' ? (
            <ValueUnitBadge unitCode={account.currency_code} size={56} />
          ) : (
            <BankLogo bankCode={account.bank_code} fallbackIcon={TYPE_ICON[type]} size={56} />
          )}
          <Text variant="sectionTitle" style={{ marginTop: theme.spacing.xs }}>
            {account.name}
          </Text>
          <Text style={{ fontSize: 38, lineHeight: 44, fontWeight: '700', letterSpacing: -1 }} tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {formatMinorAmount(balanceMinor, account.currency_code)}
          </Text>
          {type === 'cash' && account.currency_code !== 'TRY' ? (
            <ReferenceValueRow
              amountMinor={balanceMinor}
              unitCode={account.currency_code}
              rates={ratesQuery.data}
              isLoading={ratesQuery.isLoading}
            />
          ) : null}
        </Stack>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Hareket"
              variant="secondary"
              size="compact"
              icon="add"
              onPress={() => router.push({ pathname: '/transactions/new', params: { accountId: account.id } })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Transfer"
              variant="secondary"
              size="compact"
              icon="swap-horizontal"
              onPress={() => router.push({ pathname: '/transactions/new', params: { accountId: account.id, direction: 'transfer' } })}
            />
          </View>
        </View>

        <FinanceDetailTabs options={accountTabs} value={activeAccountTab} onChange={setAccountTab} />

        {activeAccountTab === 'hareketler' ? (
          <Stack gap="md">
            {sections.length === 0 ? (
              <EmptyState icon="receipt-outline" message="Bu hesapta henüz hareket yok." />
            ) : (
              <Stack gap="md">
                {sections.map((section) => (
                  <Stack gap="xs" key={section.title}>
                    <SectionHeader title={section.title} />
                    <Group>
                      {section.data.map((item) => (
                        <TransactionRow key={item.id} item={item} accountId={account.id} />
                      ))}
                    </Group>
                  </Stack>
                ))}
              </Stack>
            )}
            {totalPages > 1 ? <Pagination page={effectivePage} totalPages={totalPages} onChange={setPage} /> : null}
          </Stack>
        ) : activeAccountTab === 'bilgiler' ? (
          <Stack gap="md">
            {account.iban ? (
              <Group inset={16}>
                <GroupedRow
                  title="IBAN"
                  subtitle={maskIban(account.iban)}
                  chevron={false}
                  trailing={
                    <Button
                      label="Kopyala"
                      variant="secondary"
                      size="sm"
                      onPress={async () => {
                        await Clipboard.setStringAsync(account.iban as string);
                        showSuccessAlert('IBAN kopyalandı.', () => {});
                      }}
                    />
                  }
                />
              </Group>
            ) : null}

            <FinanceDetailInfoCard
              title="Hesap Bilgileri"
              description="Hesap türü, kimlik ve limit ayrıntıları"
              rows={accountInfoRows}
            />
            {type === 'pos' ? <PosCommissionCard account={account} /> : null}
          </Stack>
        ) : hasOverdraft ? (
          <OverdraftCard
            accountId={account.id}
            balanceMinor={balanceMinor}
            limitMinor={overdraftLimitMinor}
            currencyCode={account.currency_code}
          />
        ) : (
          <EmptyState
            icon="trending-down-outline"
            message="Bu hesapta ek hesap (KMH) limiti tanımlı değil. Limit eklemek için hesabı düzenleyin."
          />
        )}
      </DetailScaffold>

      <ActionSheet
        visible={menuOpen}
        title="Hesap işlemleri"
        onClose={() => setMenuOpen(false)}
        options={[
          {
            key: 'edit',
            label: 'Düzenle',
            description: 'Hesap bilgilerini güncelleyin.',
            icon: 'create-outline',
            onPress: () => router.push({ pathname: '/accounts/new', params: { id: account.id } }),
          },
          {
            key: 'archive',
            label: 'Arşivle',
            description: 'Hesabı listeden kaldırın; geçmiş hareketler korunsun.',
            icon: 'archive-outline',
            danger: true,
            onPress: confirmArchive,
          },
        ]}
      />
    </>
  );
}

interface OverdraftCardProps {
  accountId: string;
  balanceMinor: number;
  limitMinor: number;
  currencyCode: string;
}

// Ek hesap (KMH): bakiye sıfırın altına indiğinde kullanılan tutar, limitle sınırlıdır.
// Faiz bankadan bankaya/güne göre değiştiği için otomatik hesaplanmaz — kullanıcı ayına ait
// tutarı öğrendiğinde tek dokunuşla gider olarak eklenir (bkz. /transactions/new accountId ön dolumu).
function OverdraftCard({ accountId, balanceMinor, limitMinor, currencyCode }: OverdraftCardProps) {
  const theme = useTheme();
  const usedMinor = Math.min(Math.max(-balanceMinor, 0), limitMinor);
  const availableMinor = Math.max(0, limitMinor - usedMinor);

  return (
    <Card>
      <Stack gap="md">
        <Row gap="sm" align="center">
          <Ionicons name="trending-down-outline" size={18} color={theme.colors.textPrimary} />
          <Text variant="cardTitle">Ek Hesap (KMH)</Text>
        </Row>
        <Divider />
        <InfoRow label="Ek Hesap Limiti" value={formatMinorAmount(limitMinor, currencyCode)} />
        <InfoRow label="Kullanılan" value={formatMinorAmount(usedMinor, currencyCode)} />
        <InfoRow label="Kullanılabilir" value={formatMinorAmount(availableMinor, currencyCode)} />
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/transactions/new',
              params: { accountId, direction: 'expense', description: 'Ek hesap faizi' },
            })
          }
          style={{
            height: theme.controlHeight.segmented,
            borderRadius: theme.radius.widget,
            borderWidth: 1,
            borderColor: theme.colors.brandPrimary,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: theme.spacing.xxs,
          }}
        >
          <Ionicons name="add-circle-outline" size={16} color={theme.colors.textPrimary} />
          <Text variant="body" color="textPrimary">
            Ek Hesap Faizi Ekle
          </Text>
        </Pressable>
      </Stack>
    </Card>
  );
}

// POS hesabına girilen her tahsilat (income) gelirinden komisyon oranı kadar bir gider
// otomatik oluşur (bkz. Supabase'teki maintain_pos_commission trigger'ı) — burada yalnızca
// oran gösterilir/değiştirilir, kesinti mantığı burada tekrarlanmaz.
function PosCommissionCard({ account }: { account: Account }) {
  const theme = useTheme();
  const rate = account.pos_commission_rate;

  return (
    <Card>
      <Stack gap="md">
        <Row gap="sm" align="center">
          <Ionicons name="cut-outline" size={18} color={theme.colors.textPrimary} />
          <Text variant="cardTitle">POS Komisyonu</Text>
        </Row>
        <Divider />
        <InfoRow label="Komisyon Oranı" value={rate != null ? `%${rate}` : 'Girilmedi'} />
        <Text variant="caption" color="textSecondary">
          Bu POS&apos;a girilen her tahsilattan bu oranda komisyon otomatik düşülür ve &quot;POS
          Komisyonu&quot; kategorisiyle ayrı bir gider olarak kaydedilir. Oranı değiştirmek için hesabı
          düzenleyin.
        </Text>
      </Stack>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Row align="center">
      <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="body" tabular numberOfLines={1} style={{ maxWidth: '55%', textAlign: 'right' }}>
        {value}
      </Text>
    </Row>
  );
}

function TransactionRow({ item, accountId }: { item: TransactionWithRelations; accountId: string }) {
  const theme = useTheme();
  const isIncomingTransfer = item.direction === 'transfer' && item.transfer_to_account_id === accountId;
  const isOutgoingTransfer = item.direction === 'transfer' && item.account_id === accountId;
  const displayDirection = isIncomingTransfer ? 'income' : isOutgoingTransfer ? 'expense' : item.direction;
  const sign = displayDirection === 'expense' ? -1 : displayDirection === 'income' ? 1 : 0;
  const isTransfer = item.direction === 'transfer';
  const amountText = `${sign > 0 ? '+' : sign < 0 ? '−' : ''}${formatMinorAmount(item.amount_minor, item.currency_code)}`;

  return (
    <GroupedRow
      leading={<GroupedRowIcon name={isTransfer ? 'swap-horizontal' : sign > 0 ? 'arrow-down' : 'arrow-up'} tone={isTransfer ? 'default' : sign > 0 ? 'success' : 'default'} />}
      title={item.description || item.category?.name || item.counterparty?.name || 'Hareket'}
      subtitle={
        item.category?.name ??
        (isIncomingTransfer ? 'Gelen transfer' : isOutgoingTransfer ? 'Giden transfer' : sign > 0 ? 'Gelir' : sign < 0 ? 'Gider' : 'Transfer')
      }
      trailing={
        <Text tabular numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: sign > 0 ? theme.colors.success : theme.colors.textPrimary }}>
          {amountText}
        </Text>
      }
      onPress={() => router.push(`/transactions/${item.id}`)}
      chevron={false}
    />
  );
}
