import { useState } from 'react';
import { SectionList, View } from 'react-native';
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
  Stack,
  Text,
} from '@/components/primitives';
import { Amount } from '@/components/finance/Amount';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { PersonAvatar } from '@/components/finance/PersonAvatar';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { getCounterparty, getCounterpartyLedger } from '@/features/counterparties/api';
import { listObligations, ACTIVE_OBLIGATION_STATUSES, type ObligationWithRelations } from '@/features/obligations/api';
import { listTransactions } from '@/features/transactions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';
import { groupByDay } from '@/utils/groupByDay';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

const PAGE_SIZE = 10;

export default function CounterpartyDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const enabled = !!activeWorkspaceId && !!id;
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

  const allOpenObligations = openObligationsQuery.data ?? [];
  const obligationsTotalPages = Math.max(1, Math.ceil(allOpenObligations.length / PAGE_SIZE));
  const effectiveObligationsPage = Math.min(obligationsPage, obligationsTotalPages - 1);
  const openObligations = allOpenObligations.slice(
    effectiveObligationsPage * PAGE_SIZE,
    effectiveObligationsPage * PAGE_SIZE + PAGE_SIZE
  );

  const allTransactions = transactionsQuery.data ?? [];
  const transactionsTotalPages = Math.max(1, Math.ceil(allTransactions.length / PAGE_SIZE));
  const effectiveTransactionsPage = Math.min(transactionsPage, transactionsTotalPages - 1);
  const pagedTransactions = allTransactions.slice(
    effectiveTransactionsPage * PAGE_SIZE,
    effectiveTransactionsPage * PAGE_SIZE + PAGE_SIZE
  );
  const sections = groupByDay(pagedTransactions, (item) => item.occurred_at);

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

  // Cari bakiye işaretlidir: pozitif = bu cari size borçlu, negatif = siz borçlusunuz.
  const netMinor = ledger?.netMinor ?? 0;
  const owesUs = netMinor > 0;
  const settled = netMinor === 0;
  const netColor = settled ? theme.colors.textSecondary : owesUs ? theme.colors.success : theme.colors.textPrimary;
  const netLabel = settled ? 'Bakiye kapalı' : owesUs ? `${counterparty.name} size borçlu` : `Siz borçlusunuz`;

  // BalanceHero'daki aynı formül: halka, net bakiyenin değil alacak/borç dengesinin
  // görselidir. "Geciken" bu toplamın bir alt kümesi olduğundan pay formülüne dahil edilmez.
  const directionalTotal = (ledger?.receivableMinor ?? 0) + (ledger?.payableMinor ?? 0);
  const receivableShare = directionalTotal > 0 ? (ledger?.receivableMinor ?? 0) / directionalTotal : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.xs,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <Stack gap="lg" style={{ marginBottom: theme.spacing.lg }}>
            <Row align="center">
              <Pressable onPress={() => router.back()} hitSlop={12}>
                <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
              </Pressable>
              <PersonAvatar name={counterparty.name} size={44} />
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Text variant="pageTitle" numberOfLines={1}>
                  {counterparty.name}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {counterparty.type === 'company' ? 'Firma' : 'Kişi'}
                  {counterparty.phone || counterparty.email
                    ? ` · ${[counterparty.phone, counterparty.email].filter(Boolean).join(' · ')}`
                    : ''}
                </Text>
              </Stack>
              <Pressable
                onPress={() => router.push({ pathname: '/counterparties/new', params: { id: counterparty.id } })}
                hitSlop={12}
              >
                <Ionicons name="pencil" size={22} color={theme.colors.textPrimary} />
              </Pressable>
            </Row>

            {/* Cari kartı: sayfanın tek büyük rakamı net bakiye — "bu cariyle aram ne durumda"
                sorusunun tek cevabı. Alacak/borç kırılımı altında ikincil kalır. */}
            <Card style={{ borderRadius: theme.radius.heroWidget, padding: theme.spacing.lg }}>
              <Stack gap="md">
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
                      minimumFontScale={0.6}
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
                  <LedgerCell label="Alacak">
                    <Amount amountMinor={ledger?.receivableMinor ?? 0} direction="receivable" variant="cardTitle" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} />
                  </LedgerCell>
                  <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.sm }} />
                  <LedgerCell label="Borç">
                    <Amount amountMinor={ledger?.payableMinor ?? 0} direction="payable" variant="cardTitle" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} />
                  </LedgerCell>
                  <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.sm }} />
                  <LedgerCell label="Geciken">
                    <Text
                      variant="cardTitle"
                      tabular
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      style={{ color: (ledger?.overdueCount ?? 0) > 0 ? theme.colors.danger : theme.colors.textPrimary }}
                    >
                      {formatMinorAmount(ledger?.overdueMinor ?? 0)}
                    </Text>
                  </LedgerCell>
                </Row>

                {ledger?.nearestDueDate ? (
                  <Row
                    gap="xs"
                    style={{
                      backgroundColor: withAlpha(theme.colors.brandPrimary, 0.14),
                      borderRadius: theme.radius.input,
                      paddingHorizontal: theme.spacing.sm,
                      paddingVertical: theme.spacing.xs,
                    }}
                  >
                    <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
                    <Text variant="caption" color="textSecondary">
                      En yakın vade {dateFormatter.format(new Date(ledger.nearestDueDate))}
                    </Text>
                  </Row>
                ) : null}
              </Stack>
            </Card>

            <Stack gap="sm">
              <SectionHeader title={`Açık Kayıtlar (${allOpenObligations.length})`} />
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

            <SectionHeader title="Son Hareketler" />
          </Stack>
        }
        renderSectionHeader={({ section }) => (
          <View style={{ paddingTop: theme.spacing.sm }}>
            <SectionHeader title={section.title} />
          </View>
        )}
        renderItem={({ item }) => (
          <Card>
            <Row gap="sm" align="center">
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Text variant="body" numberOfLines={1}>
                  {item.description?.trim() || item.category?.name || 'Hareket'}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {item.account?.name ?? 'Hareket'}
                </Text>
              </Stack>
              <Amount
                amountMinor={item.amount_minor}
                currencyCode={item.currency_code}
                direction={item.direction as 'income' | 'expense' | 'transfer'}
                variant="body"
              />
            </Row>
          </Card>
        )}
        ListEmptyComponent={<EmptyState icon="receipt-outline" message="Bu cariyle henüz hareket yok." />}
        ListFooterComponent={
          transactionsTotalPages > 1 ? (
            <View style={{ paddingTop: theme.spacing.sm }}>
              <Pagination page={effectiveTransactionsPage} totalPages={transactionsTotalPages} onChange={setTransactionsPage} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function LedgerCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack gap="xxs" style={{ flex: 1 }}>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
      {children}
    </Stack>
  );
}

function OpenObligationRow({ obligation }: { obligation: ObligationWithRelations }) {
  return (
    <Pressable onPress={() => router.push(`/obligations/${obligation.id}`)}>
      <Card>
        <Row gap="sm">
          <ObligationIcon documentType={obligation.document_type} bankCode={obligation.bank_code} size={28} />
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
