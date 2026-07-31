import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Divider, EmptyState, Pressable, Row, SectionHeader, Stack, Text } from '@/components/primitives';
import { Amount } from '@/components/finance/Amount';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { getCounterparty, getCounterpartyLedger } from '@/features/counterparties/api';
import { listObligations, ACTIVE_OBLIGATION_STATUSES, type ObligationWithRelations } from '@/features/obligations/api';
import { listTransactions } from '@/features/transactions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

export default function CounterpartyDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const enabled = !!activeWorkspaceId && !!id;

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
  const openObligations = openObligationsQuery.data ?? [];

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <FlatList
        data={transactionsQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.sm,
        }}
        ListHeaderComponent={
          <Stack gap="lg" style={{ marginBottom: theme.spacing.lg }}>
            <Row align="center">
              <Pressable onPress={() => router.back()} hitSlop={12}>
                <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
              </Pressable>
              <Stack gap="xxs" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
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
                <Stack gap="xxs">
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
              <SectionHeader title={`Açık Kayıtlar (${openObligations.length})`} />
              {openObligations.length === 0 ? (
                <EmptyState icon="checkmark-circle-outline" message="Açık borç veya alacak yok." />
              ) : (
                <Stack gap="xs">
                  {openObligations.map((o) => (
                    <OpenObligationRow key={o.id} obligation={o} />
                  ))}
                </Stack>
              )}
            </Stack>

            <SectionHeader title="Son Hareketler" />
          </Stack>
        }
        renderItem={({ item }) => (
          <Card>
            <Row gap="sm">
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Text variant="cardTitle" numberOfLines={1}>
                  {item.description?.trim() || item.category?.name || 'Hareket'}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {shortDateFormatter.format(new Date(item.occurred_at))}
                  {item.account?.name ? ` · ${item.account.name}` : ''}
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
