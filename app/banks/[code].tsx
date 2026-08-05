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
  SegmentedControl,
  Stack,
  Text,
} from '@/components/primitives';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { getBankLoanLedger } from '@/features/banks/api';
import { BANK_NAME } from '@/features/banks/banks';
import { listObligations, ACTIVE_OBLIGATION_STATUSES, type ObligationWithRelations } from '@/features/obligations/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

const TAB_PAGE_SIZE = 10;
type DetailTab = 'genel' | 'krediler';

// app/obligations/[id].tsx'teki kredi detayıyla aynı hero + sekme deseni: kredi
// kayıtları kişi/firma değil banka bazlı tutulduğu için (bkz. app/obligations/new.tsx),
// bu ekran o bankaya ait toplam kredi durumunu tek bir "kredi" gibi özetler.
export default function BankDetailScreen() {
  const theme = useTheme();
  const { code } = useLocalSearchParams<{ code: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const enabled = !!activeWorkspaceId && !!code;
  const [tab, setTab] = useState<DetailTab>('genel');
  const [obligationsPage, setObligationsPage] = useState(0);

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

  const ledger = ledgerQuery.data;
  const bankName = BANK_NAME[code as string] ?? (code as string);

  const allOpenObligations = openObligationsQuery.data ?? [];
  const obligationsTotalPages = Math.max(1, Math.ceil(allOpenObligations.length / TAB_PAGE_SIZE));
  const effectiveObligationsPage = Math.min(obligationsPage, obligationsTotalPages - 1);
  const openObligations = allOpenObligations.slice(
    effectiveObligationsPage * TAB_PAGE_SIZE,
    effectiveObligationsPage * TAB_PAGE_SIZE + TAB_PAGE_SIZE
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
    { key: 'krediler', label: `Krediler (${allOpenObligations.length})` },
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
              {bankName}
            </Text>
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
                  <BankLogo bankCode={code as string} fallbackName={bankName} size={44} />
                </View>
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="cardTitle" numberOfLines={2}>
                    {bankName}
                  </Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>
                    Banka
                  </Text>
                </Stack>
                {hasOverdue ? <StatusBadge status="gecikti" /> : null}
              </Row>

              <Divider />

              <Row gap="md" align="center">
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                    KALAN BORÇ
                  </Text>
                  <Text
                    variant="displayAmount"
                    tabular
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.5}
                    style={{ color: hasOverdue ? theme.colors.danger : theme.colors.textPrimary }}
                  >
                    {formatMinorAmount(payableMinor)}
                  </Text>
                </Stack>
                {totalPayableMinor > 0 ? (
                  <ProgressRing
                    size={88}
                    strokeWidth={10}
                    progress={clampedProgress}
                    color={stateAccent}
                    trackColor={withAlpha(stateAccent, 0.18)}
                    cap
                  >
                    <Text variant="cardTitle" tabular>
                      %{Math.round(clampedProgress * 100)}
                    </Text>
                  </ProgressRing>
                ) : null}
              </Row>

              <Divider />

              <Row>
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="caption" color="textSecondary">
                    AÇIK KREDİ
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
                  <Ionicons name="business-outline" size={18} color={theme.colors.brandPrimary} />
                  <Text variant="cardTitle">Banka Bilgileri</Text>
                </Row>
                <Divider />
                <InfoRow label="Açık Kredi Sayısı" value={String(ledger?.openCount ?? 0)} />
                <InfoRow label="Kalan Borç" value={formatMinorAmount(ledger?.payableMinor ?? 0)} />
                {totalPayableMinor > 0 ? (
                  <InfoRow label="Toplam Anapara" value={formatMinorAmount(totalPayableMinor)} />
                ) : null}
                <InfoRow label="Geciken Tutar" value={formatMinorAmount(ledger?.overdueMinor ?? 0)} />
                {ledger?.nearestDueDate ? (
                  <InfoRow label="En Yakın Vade" value={dateFormatter.format(new Date(ledger.nearestDueDate))} />
                ) : null}
              </Stack>
            </Card>
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
            direction={obligation.direction as 'payable' | 'receivable'}
            overdue={obligation.status === 'gecikti'}
            variant="body"
          />
        </Row>
      </Card>
    </Pressable>
  );
}
