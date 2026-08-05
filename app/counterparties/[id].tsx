import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import {
  Card,
  Divider,
  EmptyState,
  Pagination,
  Pressable,
  ProgressRing,
  Row,
  SectionHeader,
  SegmentedControl,
  Stack,
  Text,
} from '@/components/primitives';
import { Amount } from '@/components/finance/Amount';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { PersonAvatar } from '@/components/finance/PersonAvatar';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { getCounterparty, getCounterpartyLedger } from '@/features/counterparties/api';
import { listObligations, ACTIVE_OBLIGATION_STATUSES, type ObligationWithRelations } from '@/features/obligations/api';
import { listTransactions, type TransactionWithRelations } from '@/features/transactions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';
import { groupByDay } from '@/utils/groupByDay';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

const TAB_PAGE_SIZE = 10;
type DetailTab = 'genel' | 'kayitlar' | 'hareketler';

// app/obligations/[id].tsx'teki hero + sekme deseninin cari karşılığı — tek büyük
// kart (kimlik, ana bakiye, ikincil istatistikler) ve altında Genel/Açık Kayıtlar/
// Hareketler sekmeleri.
export default function CounterpartyDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const enabled = !!activeWorkspaceId && !!id;
  const [tab, setTab] = useState<DetailTab>('genel');
  const [obligationsPage, setObligationsPage] = useState(0);
  const [transactionsPage, setTransactionsPage] = useState(0);

  const counterpartyQuery = useQuery({
    queryKey: ['counterparty', id],
    queryFn: () => getCounterparty(id as string),
    enabled: !!id,
  });

  const ledgerQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.counterpartyLedger(activeWorkspaceId, id as string)
      : ['counterparty-ledger', 'disabled'],
    queryFn: () => getCounterpartyLedger(activeWorkspaceId as string, id as string),
    enabled,
  });

  const openObligationsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.counterpartyObligations(activeWorkspaceId, id as string)
      : ['counterparty-obligations', 'disabled'],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        counterpartyId: id as string,
        statuses: ACTIVE_OBLIGATION_STATUSES,
        pageSize: 50,
      }),
    enabled,
  });

  const transactionsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.counterpartyTransactions(activeWorkspaceId, id as string)
      : ['counterparty-transactions', 'disabled'],
    queryFn: () =>
      listTransactions({ workspaceId: activeWorkspaceId as string, counterpartyId: id as string, pageSize: 20 }),
    enabled,
  });

  const counterparty = counterpartyQuery.data;
  const ledger = ledgerQuery.data;

  if (!counterparty) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          {counterpartyQuery.error ? (
            <Text variant="body" color="danger">
              {counterpartyQuery.error instanceof Error ? counterpartyQuery.error.message : 'Kayıt yüklenemedi'}
            </Text>
          ) : null}
        </Stack>
      </SafeAreaView>
    );
  }

  const allOpenObligations = openObligationsQuery.data ?? [];
  const obligationsTotalPages = Math.max(1, Math.ceil(allOpenObligations.length / TAB_PAGE_SIZE));
  const effectiveObligationsPage = Math.min(obligationsPage, obligationsTotalPages - 1);
  const openObligations = allOpenObligations.slice(
    effectiveObligationsPage * TAB_PAGE_SIZE,
    effectiveObligationsPage * TAB_PAGE_SIZE + TAB_PAGE_SIZE
  );

  const allTransactions = transactionsQuery.data ?? [];
  const transactionsTotalPages = Math.max(1, Math.ceil(allTransactions.length / TAB_PAGE_SIZE));
  const effectiveTransactionsPage = Math.min(transactionsPage, transactionsTotalPages - 1);
  const pagedTransactions = allTransactions.slice(
    effectiveTransactionsPage * TAB_PAGE_SIZE,
    effectiveTransactionsPage * TAB_PAGE_SIZE + TAB_PAGE_SIZE
  );
  const transactionSections = groupByDay(pagedTransactions, (item) => item.occurred_at);

  // Cari bakiye işaretlidir: pozitif = bu cari size borçlu, negatif = siz borçlusunuz.
  const netMinor = ledger?.netMinor ?? 0;
  const owesUs = netMinor > 0;
  const settled = netMinor === 0;
  const netColor = settled ? theme.colors.textSecondary : owesUs ? theme.colors.success : theme.colors.textPrimary;
  const netLabel = settled ? 'Bakiye kapalı' : owesUs ? `${counterparty.name} size borçlu` : 'Siz borçlusunuz';

  // Obligation detayındaki aynı formül: halka, net bakiyenin değil alacak/borç
  // dengesinin görselidir.
  const directionalTotal = (ledger?.receivableMinor ?? 0) + (ledger?.payableMinor ?? 0);
  const receivableShare = directionalTotal > 0 ? (ledger?.receivableMinor ?? 0) / directionalTotal : 0;

  const tabOptions: { key: DetailTab; label: string }[] = [
    { key: 'genel', label: 'Genel' },
    { key: 'kayitlar', label: `Açık Kayıtlar (${allOpenObligations.length})` },
    { key: 'hareketler', label: 'Hareketler' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard, paddingBottom: theme.spacing.huge }}>
        <Stack gap="lg">
          <Row align="center">
            <Pressable
              accessibilityLabel="Geri"
              onPress={() => router.back()}
              hitSlop={8}
              style={{
                width: 44,
                height: 44,
                borderRadius: theme.radius.input,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.surfaceElevated,
              }}
            >
              <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
            </Pressable>
            <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }} numberOfLines={1}>
              {counterparty.name}
            </Text>
            <Pressable
              accessibilityLabel="Düzenle"
              onPress={() => router.push({ pathname: '/counterparties/new', params: { id: counterparty.id } })}
              hitSlop={8}
              style={{
                width: 44,
                height: 44,
                borderRadius: theme.radius.input,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.surfaceElevated,
              }}
            >
              <Ionicons name="pencil" size={22} color={theme.colors.textPrimary} />
            </Pressable>
          </Row>

          <Card elevated variant="hero">
            <Stack gap="lg">
              <Row gap="sm" align="center">
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: theme.radius.input,
                    backgroundColor: theme.colors.backgroundPrimary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <PersonAvatar name={counterparty.name} size={44} />
                </View>
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="cardTitle" numberOfLines={2}>
                    {counterparty.name}
                  </Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>
                    {counterparty.type === 'company' ? 'Firma' : 'Kişi'}
                    {counterparty.phone || counterparty.email
                      ? ` · ${[counterparty.phone, counterparty.email].filter(Boolean).join(' · ')}`
                      : ''}
                  </Text>
                </Stack>
              </Row>

              <Divider />

              <Row gap="md" align="center">
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                    CARİ BAKİYE
                  </Text>
                  <Text
                    variant="displayAmount"
                    tabular
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.5}
                    style={{ color: netColor }}
                  >
                    {formatMinorAmount(Math.abs(netMinor))}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {netLabel}
                  </Text>
                </Stack>
                {directionalTotal > 0 ? (
                  <ProgressRing
                    size={88}
                    strokeWidth={10}
                    progress={receivableShare}
                    color={theme.colors.success}
                    trackColor={withAlpha(theme.colors.success, 0.18)}
                    cap
                  >
                    <Ionicons name="people-outline" size={22} color={theme.colors.success} />
                  </ProgressRing>
                ) : null}
              </Row>

              <Divider />

              <Row>
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="caption" color="textSecondary">
                    AÇIK KAYIT
                  </Text>
                  <Text variant="cardTitle" tabular numberOfLines={1}>
                    {ledger?.openCount ?? 0}
                  </Text>
                </Stack>
                <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.sm }} />
                <Stack gap="xxs" style={{ flex: 1 }} align="flex-end">
                  <Text variant="caption" color="textSecondary">
                    EN YAKIN VADE
                  </Text>
                  <Text variant="cardTitle" tabular numberOfLines={1}>
                    {ledger?.nearestDueDate ? shortDateFormatter.format(new Date(ledger.nearestDueDate)) : 'Yok'}
                  </Text>
                </Stack>
              </Row>
            </Stack>
          </Card>

          <SegmentedControl options={tabOptions} value={tab} onChange={setTab} size="compact" stretch />

          {tab === 'genel' ? (
            <Card>
              <Stack gap="md">
                <Row gap="sm" align="center">
                  <Ionicons name="person-outline" size={18} color={theme.colors.brandPrimary} />
                  <Text variant="cardTitle">Cari Bilgileri</Text>
                </Row>
                <Divider />
                <InfoRow label="Tür" value={counterparty.type === 'company' ? 'Firma' : 'Kişi'} />
                {counterparty.phone ? <InfoRow label="Telefon" value={counterparty.phone} /> : null}
                {counterparty.email ? <InfoRow label="E-posta" value={counterparty.email} /> : null}
                {counterparty.tax_number ? <InfoRow label="Vergi No" value={counterparty.tax_number} /> : null}
                <InfoRow label="Alacak" value={formatMinorAmount(ledger?.receivableMinor ?? 0)} />
                <InfoRow label="Borç" value={formatMinorAmount(ledger?.payableMinor ?? 0)} />
                <InfoRow label="Geciken" value={formatMinorAmount(ledger?.overdueMinor ?? 0)} />
                {ledger?.nearestDueDate ? (
                  <InfoRow label="En Yakın Vade" value={dateFormatter.format(new Date(ledger.nearestDueDate))} />
                ) : null}
                {counterparty.notes ? <InfoRow label="Notlar" value={counterparty.notes} /> : null}
              </Stack>
            </Card>
          ) : tab === 'kayitlar' ? (
            <Stack gap="md">
              {openObligations.length === 0 ? (
                <EmptyState icon="checkmark-circle-outline" message="Açık borç veya alacak yok." />
              ) : (
                <Stack gap="xs">
                  {openObligations.map((o) => (
                    <OpenObligationRow key={o.id} obligation={o} />
                  ))}
                </Stack>
              )}
              {obligationsTotalPages > 1 ? (
                <Pagination page={effectiveObligationsPage} totalPages={obligationsTotalPages} onChange={setObligationsPage} />
              ) : null}
            </Stack>
          ) : (
            <Stack gap="md">
              {transactionSections.length === 0 ? (
                <EmptyState icon="receipt-outline" message="Bu cariyle henüz hareket yok." />
              ) : (
                <Stack gap="md">
                  {transactionSections.map((section) => (
                    <Stack gap="xs" key={section.title}>
                      <SectionHeader title={section.title} />
                      <Stack gap="xs">
                        {section.data.map((item) => (
                          <TransactionRow key={item.id} transaction={item} />
                        ))}
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              )}
              {transactionsTotalPages > 1 ? (
                <Pagination page={effectiveTransactionsPage} totalPages={transactionsTotalPages} onChange={setTransactionsPage} />
              ) : null}
            </Stack>
          )}
        </Stack>
      </ScrollView>
    </SafeAreaView>
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

function OpenObligationRow({ obligation }: { obligation: ObligationWithRelations }) {
  return (
    <Pressable onPress={() => router.push(`/obligations/${obligation.id}`)}>
      <Card>
        <Row gap="sm">
          <ObligationIcon
            documentType={obligation.document_type}
            bankCode={obligation.bank_code}
            serviceCode={obligation.service_code}
            fallbackName={obligation.title}
            size={36}
          />
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
            direction={obligation.direction as 'payable' | 'receivable'}
            overdue={obligation.status === 'gecikti'}
            variant="body"
          />
        </Row>
      </Card>
    </Pressable>
  );
}

function TransactionRow({ transaction }: { transaction: TransactionWithRelations }) {
  return (
    <Pressable onPress={() => router.push(`/transactions/${transaction.id}`)}>
      <Card>
        <Row gap="sm" align="center">
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="body" numberOfLines={1}>
              {transaction.description?.trim() || transaction.category?.name || 'Hareket'}
            </Text>
            <Text variant="caption" color="textSecondary">
              {transaction.account?.name ?? 'Hareket'}
            </Text>
          </Stack>
          <Amount
            amountMinor={transaction.amount_minor}
            currencyCode={transaction.currency_code}
            direction={transaction.direction as 'income' | 'expense' | 'transfer'}
            variant="body"
          />
        </Row>
      </Card>
    </Pressable>
  );
}
