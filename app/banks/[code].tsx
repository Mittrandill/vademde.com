import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Card, EmptyState, GroupedRow, GroupedRowIcon, GroupedSection, Stack, Text } from '@/components/primitives';
import { DetailScaffold } from '@/components/navigation/DetailScaffold';
import { BankLogo } from '@/components/finance/BankLogo';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { BANK_NAME } from '@/features/banks/banks';
import { listObligations, ACTIVE_OBLIGATION_STATUSES } from '@/features/obligations/api';
import { listAccounts, type Account } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { maskIban } from '@/utils/iban';
import { queryKeys } from '@/services/queryKeys';

const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

// Tuval BankaDetay: ortalı banka başlığı, Varlık / Kart borcu / Net kartı ve gruplu bölümler
// (Hesaplar, Kredi kartları, Krediler, Çek ve senetler). Toplamlar yalnızca TRY hesapları kapsar —
// farklı para birimlerini kurla çevirmeden toplamak yanıltıcı olurdu.
export default function BankDetailScreen() {
  const theme = useTheme();
  const { code } = useLocalSearchParams<{ code: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const enabled = !!activeWorkspaceId && !!code;

  const loansQuery = useQuery({
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
  const chequesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'bank-cheques', code] : ['bank-cheques', 'disabled'],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        documentType: 'cek',
        bankCode: code as string,
        statuses: ACTIVE_OBLIGATION_STATUSES,
        pageSize: 50,
      }),
    enabled,
  });
  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled,
  });
  // Hesaplar ekranıyla (app/accounts/index.tsx) aynı ad-hoc anahtar — cache paylaşılır.
  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'account-balances'] : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(activeWorkspaceId as string),
    enabled,
  });
  const balanceByAccountId = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b.balanceMinor]));
  const balanceOf = (a: Account) => balanceByAccountId.get(a.id) ?? a.opening_balance_minor;

  const bankName = BANK_NAME[code as string] ?? (code as string);
  const bankAccounts = (accountsQuery.data ?? []).filter((a) => a.bank_code === code);
  const plainAccounts = bankAccounts.filter((a) => a.type !== 'credit_card');
  const cards = bankAccounts.filter((a) => a.type === 'credit_card');
  const loans = loansQuery.data ?? [];
  const cheques = chequesQuery.data ?? [];

  const assetMinor = plainAccounts.filter((a) => a.currency_code === 'TRY').reduce((sum, a) => sum + balanceOf(a), 0);
  const cardDebtMinor = cards.filter((a) => a.currency_code === 'TRY').reduce((sum, a) => sum + Math.abs(balanceOf(a)), 0);

  const counts = [
    plainAccounts.length ? `${plainAccounts.length} hesap` : null,
    cards.length ? `${cards.length} kart` : null,
    loans.length ? `${loans.length} kredi` : null,
    cheques.length ? `${cheques.length} çek` : null,
  ].filter(Boolean);

  return (
    <DetailScaffold header={{ title: bankName }} isLoading={false}>
      <Stack gap="xs" style={{ alignItems: 'center' }}>
        <BankLogo bankCode={code as string} fallbackName={bankName} size={64} />
        <Text variant="sectionTitle" style={{ marginTop: theme.spacing.xs }}>
          {bankName}
        </Text>
        <Text variant="caption" color="textSecondary">
          {counts.length ? counts.join(' · ') : 'Henüz kayıt yok'}
        </Text>
      </Stack>

      <Card style={{ flexDirection: 'row' }}>
        <StatCell label="Varlık" value={formatMinorAmount(assetMinor)} />
        <StatCell label="Kart borcu" value={formatMinorAmount(cardDebtMinor)} />
        <StatCell label="Net" value={formatMinorAmount(assetMinor - cardDebtMinor)} align="flex-end" />
      </Card>

      {plainAccounts.length > 0 ? (
        <GroupedSection title="Hesaplar">
          {plainAccounts.map((a) => (
            <GroupedRow
              key={a.id}
              leading={<BankLogo bankCode={a.bank_code} fallbackIcon="business-outline" size={34} />}
              title={a.name}
              subtitle={[a.iban ? maskIban(a.iban) : null, a.currency_code !== 'TRY' ? a.currency_code : null].filter(Boolean).join(' · ') || undefined}
              value={formatMinorAmount(balanceOf(a), a.currency_code)}
              onPress={() => router.push(`/accounts/${a.id}`)}
            />
          ))}
        </GroupedSection>
      ) : null}

      {cards.length > 0 ? (
        <GroupedSection title="Kredi kartları">
          {cards.map((a) => (
            <GroupedRow
              key={a.id}
              leading={<GroupedRowIcon name="card" />}
              title={a.card_last_four ? `${a.name} · •••• ${a.card_last_four}` : a.name}
              value={formatMinorAmount(Math.abs(balanceOf(a)), a.currency_code)}
              onPress={() => router.push(`/accounts/${a.id}`)}
            />
          ))}
        </GroupedSection>
      ) : null}

      {loans.length > 0 ? (
        <GroupedSection title="Krediler">
          {loans.map((o) => (
            <GroupedRow
              key={o.id}
              leading={<ObligationIcon documentType={o.document_type} bankCode={o.bank_code} size={34} />}
              title={o.title}
              subtitle={o.due_date ? `Vade ${shortDateFormatter.format(new Date(o.due_date))}` : undefined}
              value={formatMinorAmount(o.remaining_amount_minor, o.currency_code)}
              onPress={() => router.push(`/obligations/${o.id}`)}
            />
          ))}
        </GroupedSection>
      ) : null}

      {cheques.length > 0 ? (
        <GroupedSection title="Çek ve senetler">
          {cheques.map((o) => (
            <GroupedRow
              key={o.id}
              leading={<GroupedRowIcon name="document-text" tone="violet" />}
              title={o.title}
              subtitle={o.due_date ? shortDateFormatter.format(new Date(o.due_date)) : undefined}
              value={`${o.direction === 'receivable' ? '+' : ''}${formatMinorAmount(o.remaining_amount_minor, o.currency_code)}`}
              onPress={() => router.push(`/obligations/${o.id}`)}
            />
          ))}
        </GroupedSection>
      ) : null}

      {accountsQuery.isSuccess && bankAccounts.length === 0 && loans.length === 0 && cheques.length === 0 ? (
        <EmptyState icon="business-outline" message="Bu bankaya bağlı kayıt yok." />
      ) : null}
    </DetailScaffold>
  );
}

function StatCell({ label, value, align = 'flex-start' }: { label: string; value: string; align?: 'flex-start' | 'flex-end' }) {
  return (
    <Stack gap="xxs" style={{ flex: 1, alignItems: align }}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <Text style={{ fontSize: 15, fontWeight: '600' }} tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </Stack>
  );
}
