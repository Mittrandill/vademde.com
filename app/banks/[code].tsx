import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, EmptyState, Pagination, Pressable, Row, Stack, Text } from '@/components/primitives';
import { DetailScaffold } from '@/components/navigation/DetailScaffold';
import {
  FinanceDetailHero,
  FinanceDetailInfoCard,
  FinanceDetailTabs,
} from '@/components/finance/FinanceDetailBlocks';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { getBankLoanLedger } from '@/features/banks/api';
import { BANK_NAME } from '@/features/banks/banks';
import { listObligations, ACTIVE_OBLIGATION_STATUSES, type ObligationWithRelations } from '@/features/obligations/api';
import { listAccounts, type Account } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { maskIban } from '@/utils/iban';
import { queryKeys } from '@/services/queryKeys';
import type { ValueUnitType } from '@/features/valueUnits/units';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

const ACCOUNT_TYPE_ICON: Record<Account['type'], keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline',
  bank: 'business-outline',
  wallet: 'wallet-outline',
  credit_card: 'card-outline',
  pos: 'storefront-outline',
};

const ACCOUNT_TYPE_LABEL: Record<Account['type'], string> = {
  cash: 'Kasa',
  bank: 'Banka',
  wallet: 'Cüzdan',
  credit_card: 'Kredi Kartı',
  pos: 'POS',
};

const TAB_PAGE_SIZE = 10;
type DetailTab = 'genel' | 'hesaplar' | 'krediler';

// app/obligations/[id].tsx'teki kredi detayıyla aynı hero + sekme deseni (DetailScaffold/
// DetailHeroCard üzerinden paylaşılıyor): kredi kayıtları kişi/firma değil banka bazlı
// tutulduğu için (bkz. app/obligations/new.tsx), bu ekran o bankaya ait toplam kredi
// durumunu tek bir "kredi" gibi özetler.
export default function BankDetailScreen() {
  const theme = useTheme();
  const { code } = useLocalSearchParams<{ code: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const enabled = !!activeWorkspaceId && !!code;
  const [tab, setTab] = useState<DetailTab>('genel');
  const [obligationsPage, setObligationsPage] = useState(0);
  const [accountsPage, setAccountsPage] = useState(0);

  const ledgerQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.bankLoanLedger(activeWorkspaceId, code as string)
      : ['bank-loan-ledger', 'disabled'],
    queryFn: () => getBankLoanLedger(activeWorkspaceId as string, code as string),
    enabled,
  });

  const openObligationsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.bankLoanObligations(activeWorkspaceId, code as string)
      : ['bank-loan-obligations', 'disabled'],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        documentType: 'kredi',
        bankCode: code as string,
        statuses: ACTIVE_OBLIGATION_STATUSES,
        pageSize: 50,
      }),
    enabled,
  });

  // Hesaplar ve kredi kartları da (accounts.bank_code) bu bankaya bağlanır — hesap listesi
  // workspace başına küçük olduğundan (Hesaplar ekranındaki aynı desen) tek seferde çekilip
  // burada bank_code'a göre filtrelenir, ayrı bir filtreli endpoint gerekmez.
  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled,
  });
  // Hesaplar ekranıyla (app/accounts/index.tsx) aynı ad-hoc anahtar kullanılır — böylece
  // iki ekran arasında geçişte bu sorgu yeniden çekilmez, cache paylaşılır.
  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'account-balances'] : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(activeWorkspaceId as string),
    enabled,
  });
  const balanceByAccountId = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b.balanceMinor]));

  const ledger = ledgerQuery.data;
  const bankName = BANK_NAME[code as string] ?? (code as string);

  const allOpenObligations = openObligationsQuery.data ?? [];
  const obligationsTotalPages = Math.max(1, Math.ceil(allOpenObligations.length / TAB_PAGE_SIZE));
  const effectiveObligationsPage = Math.min(obligationsPage, obligationsTotalPages - 1);
  const openObligations = allOpenObligations.slice(
    effectiveObligationsPage * TAB_PAGE_SIZE,
    effectiveObligationsPage * TAB_PAGE_SIZE + TAB_PAGE_SIZE
  );

  const allBankAccounts = (accountsQuery.data ?? []).filter((a) => a.bank_code === code);
  const accountsTotalPages = Math.max(1, Math.ceil(allBankAccounts.length / TAB_PAGE_SIZE));
  const effectiveAccountsPage = Math.min(accountsPage, accountsTotalPages - 1);
  const bankAccounts = allBankAccounts.slice(
    effectiveAccountsPage * TAB_PAGE_SIZE,
    effectiveAccountsPage * TAB_PAGE_SIZE + TAB_PAGE_SIZE
  );

  const hasOverdue = (ledger?.overdueCount ?? 0) > 0;
  const stateAccent = hasOverdue ? theme.colors.danger : theme.colors.brandPrimary;
  const payableMinor = ledger?.payableMinor ?? 0;
  const totalPayableMinor = ledger?.totalPayableMinor ?? 0;
  // Tekil kredi detayındaki taksit ilerleme halkasının banka toplamı karşılığı:
  // bankaya ait tüm kredilerin ne kadarı ödendi.
  const progress = totalPayableMinor > 0 ? 1 - payableMinor / totalPayableMinor : 0;
  const clampedProgress = Math.max(0, Math.min(1, progress));

  const tabOptions: { key: DetailTab; label: string }[] = [
    { key: 'genel', label: 'Genel' },
    { key: 'hesaplar', label: `Hesaplar (${allBankAccounts.length})` },
    { key: 'krediler', label: `Krediler (${allOpenObligations.length})` },
  ];
  const infoRows = [
    { label: 'Hesap Sayısı', value: String(allBankAccounts.length) },
    { label: 'Açık Kredi Sayısı', value: String(ledger?.openCount ?? 0) },
    { label: 'Kalan Borç', value: formatMinorAmount(ledger?.payableMinor ?? 0) },
    ...(totalPayableMinor > 0
      ? [{ label: 'Toplam Anapara', value: formatMinorAmount(totalPayableMinor) }]
      : []),
    { label: 'Geciken Tutar', value: formatMinorAmount(ledger?.overdueMinor ?? 0) },
    ...(ledger?.nearestDueDate
      ? [{ label: 'En Yakın Vade', value: dateFormatter.format(new Date(ledger.nearestDueDate)) }]
      : []),
  ];

  return (
    <DetailScaffold header={{ title: bankName }} isLoading={false}>
      <FinanceDetailHero
        icon={<BankLogo bankCode={code as string} fallbackName={bankName} size={44} />}
        title={bankName}
        status={hasOverdue ? <StatusBadge status="gecikti" /> : undefined}
        amountLabel="KALAN BORÇ"
        amount={formatMinorAmount(payableMinor)}
        amountColor={hasOverdue ? theme.colors.danger : theme.colors.textPrimary}
        progress={totalPayableMinor > 0 ? clampedProgress : undefined}
        progressColor={stateAccent}
        stats={[
          { label: 'HESAP', value: String(allBankAccounts.length) },
          { label: 'AÇIK KREDİ', value: String(ledger?.openCount ?? 0) },
          {
            label: 'EN YAKIN VADE',
            value: ledger?.nearestDueDate ? shortDateFormatter.format(new Date(ledger.nearestDueDate)) : 'Yok',
          },
        ]}
      />

      <FinanceDetailTabs options={tabOptions} value={tab} onChange={setTab} />

      {tab === 'genel' ? (
        <FinanceDetailInfoCard
          title="Banka Bilgileri"
          description="Hesap, kredi ve ödeme özeti"
          rows={infoRows}
        />
      ) : tab === 'hesaplar' ? (
        <Stack gap="md">
          {bankAccounts.length === 0 ? (
            <EmptyState icon="wallet-outline" message="Bu bankaya ait hesap veya kart yok." />
          ) : (
            <Stack gap="xs">
              {bankAccounts.map((account) => (
                <BankAccountRow
                  key={account.id}
                  account={account}
                  balanceMinor={balanceByAccountId.get(account.id) ?? account.opening_balance_minor}
                />
              ))}
            </Stack>
          )}
          {accountsTotalPages > 1 ? (
            <Pagination page={effectiveAccountsPage} totalPages={accountsTotalPages} onChange={setAccountsPage} />
          ) : null}
        </Stack>
      ) : (
        <Stack gap="md">
          {openObligations.length === 0 ? (
            <EmptyState icon="checkmark-circle-outline" message="Bu bankaya ait açık kredi yok." />
          ) : (
            <Stack gap="xs">
              {openObligations.map((o) => (
                <OpenLoanRow key={o.id} obligation={o} />
              ))}
            </Stack>
          )}
          {obligationsTotalPages > 1 ? (
            <Pagination page={effectiveObligationsPage} totalPages={obligationsTotalPages} onChange={setObligationsPage} />
          ) : null}
        </Stack>
      )}
    </DetailScaffold>
  );
}

function OpenLoanRow({ obligation }: { obligation: ObligationWithRelations }) {
  return (
    <Pressable onPress={() => router.push(`/obligations/${obligation.id}`)}>
      <Card>
        <Row gap="sm">
          <ObligationIcon documentType={obligation.document_type} bankCode={obligation.bank_code} size={36} />
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle" numberOfLines={1}>
              {obligation.title}
            </Text>
            <Row gap="xs">
              <Text variant="caption" color="textSecondary">
                {obligation.due_date ? shortDateFormatter.format(new Date(obligation.due_date)) : 'Vade yok'}
              </Text>
              <StatusBadge status={obligation.status} />
            </Row>
          </Stack>
          <Amount
            amountMinor={obligation.remaining_amount_minor}
            currencyCode={obligation.currency_code}
            valueUnitType={obligation.value_unit_type as ValueUnitType}
            direction={obligation.direction as 'payable' | 'receivable'}
            overdue={obligation.status === 'gecikti'}
            variant="body"
          />
        </Row>
      </Card>
    </Pressable>
  );
}

// Hesaplar ekranındaki (app/accounts/index.tsx) satırla aynı görsel dil — normal hesap ve
// kredi kartı burada birlikte listelenir, tür rozetiyle ayrışır.
function BankAccountRow({ account, balanceMinor }: { account: Account; balanceMinor: number }) {
  const theme = useTheme();
  const type = account.type as Account['type'];

  return (
    <Pressable onPress={() => router.push(`/accounts/${account.id}`)}>
      <Card>
        <Row gap="sm" align="center">
          <BankLogo bankCode={account.bank_code} fallbackIcon={ACCOUNT_TYPE_ICON[type]} size={36} />
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle" numberOfLines={1}>
              {account.name}
            </Text>
            <Row gap="xs" align="center">
              <View
                style={{
                  paddingHorizontal: theme.spacing.xs,
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: withAlpha(theme.colors.textSecondary, 0.14),
                }}
              >
                <Text variant="caption" color="textSecondary">
                  {ACCOUNT_TYPE_LABEL[type]}
                </Text>
              </View>
              {account.iban ? (
                <Text variant="caption" color="textSecondary" tabular numberOfLines={1}>
                  {maskIban(account.iban)}
                </Text>
              ) : null}
            </Row>
          </Stack>
          <Amount
            amountMinor={balanceMinor}
            currencyCode={account.currency_code}
            variant="cardTitle"
            numberOfLines={1}
            overdue={balanceMinor < 0}
          />
        </Row>
      </Card>
    </Pressable>
  );
}
