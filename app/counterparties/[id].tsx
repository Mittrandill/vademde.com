import { useState } from 'react';
import { Alert, InteractionManager, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import {
  ActionSheet,
  Card,
  EmptyState,
  Group,
  Pagination,
  Pressable,
  Row,
  SectionHeader,
  Stack,
  Text,
} from '@/components/primitives';
import { DetailScaffold } from '@/components/navigation/DetailScaffold';
import { ReminderSheet } from '@/components/finance/ReminderSheet';
import {
  FinanceDetailInfoCard,
  FinanceDetailTabs,
} from '@/components/finance/FinanceDetailBlocks';
import { ReceiptRow } from '@/components/finance/ReceiptRow';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { PersonAvatar } from '@/components/finance/PersonAvatar';
import { OBLIGATION_STATUS_LABEL, StatusBadge, type ObligationStatus } from '@/components/finance/StatusBadge';
import {
  deleteCounterparty,
  getCounterparty,
  getCounterpartyLedger,
  getCounterpartyStatement,
  getCounterpartyTypeLabel,
  type StatementEntry,
} from '@/features/counterparties/api';
import {
  listObligations,
  ACTIVE_OBLIGATION_STATUSES,
  type ObligationWithRelations,
} from '@/features/obligations/api';
import { listReceiptArchive, useDocumentArchiveAccess } from '@/features/receipts/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';
import { DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import { showSuccessAlert } from '@/utils/alerts';
import type { ValueUnitType } from '@/features/valueUnits/units';
import { capitalizeUi, localeDateFormatter, upperUi, zeroFractionPattern } from '@/i18n/format';
import { t } from '@/i18n';

// Tahsilat Al / Ödeme Yap → /payments/new (bkz. features/payments/api.ts settleObligations).
// Önceden "Çek/Senet" seçimi Borç/Alacak formuna gidip bağımsız yeni bir kayıt açıyordu; faturaya
// çek verilince borç ikiye katlanıyordu. Yöntem (nakit, havale, kart, çek, senet) artık formun
// içinde seçilir ve her yöntem seçilen açık kayıtları kapatır.

const dateFormatter = localeDateFormatter({ day: '2-digit', month: 'short', year: 'numeric' });
const shortDateFormatter = localeDateFormatter({ day: '2-digit', month: 'short' });

const TAB_PAGE_SIZE = 10;
// Ekstre satırları kısa ve günlere gruplu olduğundan sayfa başına daha fazlası gösterilir.
const STATEMENT_PAGE_SIZE = 25;
type DetailTab = 'genel' | 'kayitlar' | 'hareketler';

// app/obligations/[id].tsx'teki hero + sekme deseninin cari karşılığı (DetailScaffold/
// DetailHeroCard üzerinden paylaşılıyor) — tek büyük kart (kimlik, ana bakiye, ikincil
// istatistikler) ve altında Genel/Açık Kayıtlar/Hareketler sekmeleri.
export default function CounterpartyDetailScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const enabled = !!activeWorkspaceId && !!id;
  const [tab, setTab] = useState<DetailTab>('kayitlar');
  const [menuOpen, setMenuOpen] = useState(false);
  const [obligationsPage, setObligationsPage] = useState(0);
  const [transactionsPage, setTransactionsPage] = useState(0);

  const deleteCounterpartyMutation = useMutation({
    mutationFn: () => deleteCounterparty(id as string),
    onSuccess: () => {
      showSuccessAlert(t('counterparties.detail.deleted'), () => {
        router.replace('/counterparties');
        InteractionManager.runAfterInteractions(() => {
          if (activeWorkspaceId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.counterparties(activeWorkspaceId) });
          }
          queryClient.removeQueries({ queryKey: ['counterparty', id] });
        });
      });
    },
    onError: () => {
      Alert.alert(
        t('counterparties.form.deleteFailed'),
        t('counterparties.detail.inUse')
      );
    },
  });

  function confirmDeleteCounterparty() {
    Alert.alert(t('counterparties.detail.deleteTitle'), t('counterparties.detail.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteCounterpartyMutation.mutate() },
    ]);
  }

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

  // Hareketler sekmesi: faturalar/fişler, çek/senet/avans kayıtları, bunlara yapılan ödeme ve
  // tahsilatlar ve kayda bağlı olmayan hareketler — yürüyen cari bakiyesiyle (bkz. getCounterpartyStatement).
  const statementQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.counterpartyStatement(activeWorkspaceId, id as string)
      : ['counterparty-statement', 'disabled'],
    queryFn: () => getCounterpartyStatement(activeWorkspaceId as string, id as string),
    enabled: enabled && tab === 'hareketler',
  });

  // Belge arşivi (Plus): bu cariyle ilgili ödemelere eklenmiş dekontlar (bkz. features/receipts/api.ts).
  const archive = useDocumentArchiveAccess();
  const receiptsQuery = useQuery({
    queryKey: [activeWorkspaceId, 'receipt-archive', id],
    queryFn: () => listReceiptArchive({ workspaceId: activeWorkspaceId as string, counterpartyId: id as string }),
    enabled: enabled && archive.allowed,
  });
  const receipts = receiptsQuery.data ?? [];

  const [reminderOpen, setReminderOpen] = useState(false);
  const counterparty = counterpartyQuery.data;
  const ledger = ledgerQuery.data;

  if (!counterparty) {
    return (
      <DetailScaffold
        header={{ title: '' }}
        isLoading
        error={counterpartyQuery.error}
        errorFallbackMessage={t('counterparties.detail.loadFailed')}
      >
        {null}
      </DetailScaffold>
    );
  }

  // Tüm listeler en yeni tarih üstte (vade; vadesi olmayanlarda oluşturma tarihi).
  const allOpenObligations = [...(openObligationsQuery.data ?? [])].sort((a, b) =>
    (b.due_date ?? b.created_at).localeCompare(a.due_date ?? a.created_at)
  );
  const obligationsTotalPages = Math.max(1, Math.ceil(allOpenObligations.length / TAB_PAGE_SIZE));
  const effectiveObligationsPage = Math.min(obligationsPage, obligationsTotalPages - 1);
  const openObligations = allOpenObligations.slice(
    effectiveObligationsPage * TAB_PAGE_SIZE,
    effectiveObligationsPage * TAB_PAGE_SIZE + TAB_PAGE_SIZE
  );

  const allEntries = statementQuery.data ?? [];
  const transactionsTotalPages = Math.max(1, Math.ceil(allEntries.length / STATEMENT_PAGE_SIZE));
  const effectiveTransactionsPage = Math.min(transactionsPage, transactionsTotalPages - 1);
  const pagedEntries = allEntries.slice(
    effectiveTransactionsPage * STATEMENT_PAGE_SIZE,
    effectiveTransactionsPage * STATEMENT_PAGE_SIZE + STATEMENT_PAGE_SIZE
  );

  // Cari bakiye işaretlidir: pozitif = bu cari size borçlu, negatif = siz borçlusunuz.
  const netMinor = ledger?.netMinor ?? 0;
  const owesUs = netMinor > 0;
  const settled = netMinor === 0;
  const netColor = settled ? theme.colors.textSecondary : owesUs ? theme.colors.success : theme.colors.textPrimary;

  // Obligation detayındaki aynı formül: halka, net bakiyenin değil alacak/borç
  // dengesinin görselidir.
  const directionalTotal = (ledger?.receivableMinor ?? 0) + (ledger?.payableMinor ?? 0);
  const receivableShare = directionalTotal > 0 ? (ledger?.receivableMinor ?? 0) / directionalTotal : 0;

  const tabOptions: { key: DetailTab; label: string }[] = [
    { key: 'kayitlar', label: t('counterparties.detail.openTab', { count: allOpenObligations.length }) },
    { key: 'hareketler', label: t('counterparties.detail.transactionsTab') },
    { key: 'genel', label: t('counterparties.detail.infoTab') },
  ];
  // Faturayı kapatmış çek/senetler cari bakiyesine girmez; vadede hareket edecek tutar olarak not düşülür.
  const instrumentParts = [
    ledger?.instrumentPayableMinor
      ? t('counterparties.detail.instrumentPayable', { amount: formatMinorAmount(ledger.instrumentPayableMinor) })
      : null,
    ledger?.instrumentReceivableMinor
      ? t('counterparties.detail.instrumentReceivable', { amount: formatMinorAmount(ledger.instrumentReceivableMinor) })
      : null,
  ].filter((part): part is string => !!part);
  const instrumentNoteBody = instrumentParts.join('; ');
  const instrumentNote = instrumentNoteBody
    ? t('counterparties.detail.instrumentNote', { body: capitalizeUi(instrumentNoteBody) })
    : null;

  const infoRows = [
    { label: t('counterparties.detail.type'), value: getCounterpartyTypeLabel(counterparty.type) },
    ...(counterparty.phone ? [{ label: t('counterparties.detail.phone'), value: counterparty.phone }] : []),
    ...(counterparty.email ? [{ label: t('counterparties.detail.email'), value: counterparty.email }] : []),
    ...(counterparty.tax_number
      ? [{ label: counterparty.type === 'company' ? t('counterparties.detail.taxNo') : counterparty.type === 'personel' ? t('counterparties.detail.nationalId') : t('counterparties.detail.idOrTax'), value: counterparty.tax_number }]
      : []),
    { label: t('counterparties.detail.receivable'), value: formatMinorAmount(ledger?.receivableMinor ?? 0) },
    { label: t('counterparties.detail.payable'), value: formatMinorAmount(ledger?.payableMinor ?? 0) },
    { label: t('counterparties.detail.overdue'), value: formatMinorAmount(ledger?.overdueMinor ?? 0) },
    // Faturayı kapatmış çek/senet cari bakiyesine girmez (cari çek verilince kapanır); vadede
    // hesaptan ödenecek/tahsil edilecek tutar olarak burada ayrıca görünür.
    ...(ledger?.instrumentPayableMinor
      ? [{ label: t('counterparties.detail.instrumentPayableRow'), value: formatMinorAmount(ledger.instrumentPayableMinor) }]
      : []),
    ...(ledger?.instrumentReceivableMinor
      ? [{ label: t('counterparties.detail.instrumentReceivableRow'), value: formatMinorAmount(ledger.instrumentReceivableMinor) }]
      : []),
    ...(ledger?.nearestDueDate
      ? [{ label: t('counterparties.detail.nearestDue'), value: dateFormatter.format(new Date(ledger.nearestDueDate)) }]
      : []),
    ...(counterparty.notes ? [{ label: t('counterparties.detail.notes'), value: counterparty.notes }] : []),
  ];

  return (
    <>
    <ReminderSheet
      visible={reminderOpen}
      onClose={() => setReminderOpen(false)}
      workspaceId={activeWorkspaceId as string}
      counterparty={counterparty}
      netMinor={netMinor}
      dueDate={ledger?.nearestDueDate ?? null}
      overdue={(ledger?.overdueCount ?? 0) > 0}
    />
    <DetailScaffold
      header={{
        title: counterparty.name,
        right: {
          icon: 'ellipsis-horizontal',
          accessibilityLabel: t('counterparties.detail.actionsA11y'),
          onPress: () => setMenuOpen(true),
        },
      }}
      isLoading={false}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <PersonAvatar name={counterparty.name} size={56} />
        <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
          <Text variant="sectionTitle" numberOfLines={2}>
            {counterparty.name}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {[getCounterpartyTypeLabel(counterparty.type), counterparty.tax_number ? `${counterparty.type === 'company' ? t('counterparties.detail.taxShort') : t('counterparties.detail.idOrTaxShort')} ${counterparty.tax_number}` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Stack>
      </View>

      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row' }}>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="caption" color="textSecondary">
              {t('counterparties.detail.netBalance')}
            </Text>
            <Text
              tabular
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              style={{ fontSize: 26, lineHeight: 32, fontWeight: '700', color: netColor }}
            >
              {netMinor < 0 ? '−' : ''}
              {formatMinorAmount(Math.abs(netMinor))}
            </Text>
            <Text variant="caption" color="textSecondary">
              {settled ? t('counterparties.detail.settled') : owesUs ? t('counterparties.detail.owesYou') : t('counterparties.detail.youOwe')}
            </Text>
          </Stack>
          <Stack gap="xxs" style={{ alignItems: 'flex-end' }}>
            <Text variant="caption" color="textSecondary">
              {t('counterparties.detail.nearestDueShort')}
            </Text>
            <Text style={{ fontSize: 15, fontWeight: '600' }}>
              {ledger?.nearestDueDate ? shortDateFormatter.format(new Date(ledger.nearestDueDate)) : t('counterparties.detail.none')}
            </Text>
          </Stack>
        </View>
        <View style={{ height: 1, backgroundColor: theme.colors.separator }} />
        <View style={{ flexDirection: 'row' }}>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="caption" color="textSecondary">
              {t('counterparties.detail.payable')}
            </Text>
            <Text tabular style={{ fontSize: 15, fontWeight: '600' }}>
              {formatMinorAmount(ledger?.payableMinor ?? 0)}
            </Text>
          </Stack>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="caption" color="textSecondary">
              {t('counterparties.detail.receivable')}
            </Text>
            <Text tabular style={{ fontSize: 15, fontWeight: '600', color: theme.colors.success }}>
              {formatMinorAmount(ledger?.receivableMinor ?? 0)}
            </Text>
          </Stack>
          <Stack gap="xxs" style={{ alignItems: 'flex-end' }}>
            <Text variant="caption" color="textSecondary">
              {t('counterparties.detail.overdue')}
            </Text>
            <Text tabular style={{ fontSize: 15, fontWeight: '600' }}>
              {formatMinorAmount(ledger?.overdueMinor ?? 0)}
            </Text>
          </Stack>
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <QuickAction
          icon="arrow-up"
          label={t('counterparties.detail.pay')}
          primary
          onPress={() => router.push({ pathname: '/payments/new', params: { direction: 'payable', counterpartyId: counterparty.id } })}
        />
        <QuickAction
          icon="arrow-down"
          label={t('counterparties.detail.collect')}
          onPress={() => router.push({ pathname: '/payments/new', params: { direction: 'receivable', counterpartyId: counterparty.id } })}
        />
        <QuickAction
          icon="document-text"
          label={t('counterparties.detail.purchaseInvoice')}
          onPress={() =>
            router.push({ pathname: '/obligations/new', params: { type: 'fatura', direction: 'payable', counterpartyId: counterparty.id } })
          }
        />
        <QuickAction
          icon="receipt"
          label={t('counterparties.detail.salesInvoice')}
          onPress={() =>
            router.push({ pathname: '/obligations/new', params: { type: 'fatura', direction: 'receivable', counterpartyId: counterparty.id } })
          }
        />
      </View>

      {instrumentNote ? (
        <Text variant="caption" color="textSecondary">
          {instrumentNote}
        </Text>
      ) : null}

      <FinanceDetailTabs options={tabOptions} value={tab} onChange={setTab} />

      {tab === 'genel' ? (
        <Stack gap="md">
          {!archive.allowed && !archive.isLoading ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/paywall')}>
              <Card>
                <Row gap="sm" align="center">
                  <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textSecondary} />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="cardTitle">{t('counterparties.detail.receiptsLocked')}</Text>
                    <Text variant="caption" color="textSecondary">
                      {t('counterparties.detail.receiptsLockedBody')}
                    </Text>
                  </Stack>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </Row>
              </Card>
            </Pressable>
          ) : receipts.length > 0 ? (
            <Stack gap="xs">
              <SectionHeader title={t('counterparties.detail.receipts')} />
              {receipts.slice(0, 3).map((item) => (
                <ReceiptRow key={item.documentId} item={item} hideCounterparty />
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/documents/archive', params: { counterpartyId: id as string } })}
              >
                <Row gap="xs" align="center" style={{ justifyContent: 'center', paddingVertical: theme.spacing.xs }}>
                  <Text variant="caption" style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>
                    {t('counterparties.detail.seeAll', { count: receipts.length })}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.colors.textPrimary} />
                </Row>
              </Pressable>
            </Stack>
          ) : null}
          <FinanceDetailInfoCard
            title={t('counterparties.detail.infoTitle')}
            description={t('counterparties.detail.infoBody')}
            rows={infoRows}
          />
        </Stack>
      ) : tab === 'kayitlar' ? (
        <Stack gap="md">
          {openObligations.length === 0 ? (
            <EmptyState icon="checkmark-circle-outline" message={t('counterparties.detail.noOpen')} />
          ) : (
            <Group>
              {openObligations.map((o) => (
                <OpenObligationRow key={o.id} obligation={o} />
              ))}
            </Group>
          )}
          {obligationsTotalPages > 1 ? (
            <Pagination page={effectiveObligationsPage} totalPages={obligationsTotalPages} onChange={setObligationsPage} />
          ) : null}
        </Stack>
      ) : (
        <Stack gap="md">
          {statementQuery.isPending ? null : pagedEntries.length === 0 ? (
            <EmptyState icon="receipt-outline" message={t('counterparties.detail.noTransactions')} />
          ) : (
            <StatementTable entries={pagedEntries} />
          )}
          {transactionsTotalPages > 1 ? (
            <Pagination page={effectiveTransactionsPage} totalPages={transactionsTotalPages} onChange={setTransactionsPage} />
          ) : null}
        </Stack>
      )}
    </DetailScaffold>
    <ActionSheet
      visible={menuOpen}
      title={t('counterparties.detail.actionsA11y')}
      onClose={() => setMenuOpen(false)}
      options={[
        ...(owesUs
          ? [
              {
                key: 'reminder',
                label: t('counterparties.detail.sendReminder'),
                description: t('counterparties.detail.sendReminderBody'),
                icon: 'notifications-outline' as const,
                onPress: () => setReminderOpen(true),
              },
            ]
          : []),
        {
          key: 'sales-invoice',
          label: t('counterparties.detail.createSales'),
          description: t('counterparties.detail.createSalesBody'),
          icon: 'document-text-outline',
          onPress: () =>
            router.push({
              pathname: '/obligations/new',
              params: { type: 'fatura', direction: 'receivable', counterpartyId: counterparty.id },
            }),
        },
        {
          key: 'purchase-invoice',
          label: t('counterparties.detail.createPurchase'),
          description: t('counterparties.detail.createPurchaseBody'),
          icon: 'document-text-outline',
          onPress: () =>
            router.push({
              pathname: '/obligations/new',
              params: { type: 'fatura', direction: 'payable', counterpartyId: counterparty.id },
            }),
        },
        {
          key: 'collection',
          label: t('counterparties.detail.collectAction'),
          description: t('counterparties.detail.collectActionBody'),
          icon: 'arrow-down-circle-outline',
          onPress: () =>
            router.push({ pathname: '/payments/new', params: { direction: 'receivable', counterpartyId: counterparty.id } }),
        },
        {
          key: 'payment',
          label: t('counterparties.detail.payAction'),
          description: t('counterparties.detail.payActionBody'),
          icon: 'arrow-up-circle-outline',
          onPress: () =>
            router.push({ pathname: '/payments/new', params: { direction: 'payable', counterpartyId: counterparty.id } }),
        },
        {
          key: 'edit',
          label: t('common.edit'),
          description: t('counterparties.detail.editBody'),
          icon: 'create-outline',
          onPress: () => router.push({ pathname: '/counterparties/new', params: { id: counterparty.id } }),
        },
        {
          key: 'delete',
          label: deleteCounterpartyMutation.isPending ? t('counterparties.detail.deleting') : t('common.delete'),
          description: t('counterparties.detail.deleteActionBody'),
          icon: 'trash-outline',
          danger: true,
          onPress: () => {
            if (!deleteCounterpartyMutation.isPending) confirmDeleteCounterparty();
          },
        },
      ]}
    />
    </>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  primary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: primary ? theme.colors.brandPrimary : theme.colors.surfacePrimary,
        }}
      >
        <Ionicons name={icon} size={20} color={primary ? theme.colors.onAction : theme.colors.textPrimary} />
      </View>
      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', textAlign: 'center' }}>
        {label}
      </Text>
    </Pressable>
  );
}

// Cari listelerinin ortak satırı (Ana Sayfa'daki Yaklaşan vadeler satırının ikonlu hâli): solda
// belge/ödeme ikonu, ortada başlık ve tarihli alt satır, sağda tutar ve altında bakiye/durum.
function LedgerRow({
  leading,
  title,
  caption,
  amount,
  amountColor,
  footer,
  onPress,
}: {
  leading: React.ReactNode;
  title: string;
  caption: string;
  amount: string;
  amountColor: string;
  footer?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!onPress}
      style={{ minHeight: 60, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontWeight: '500' }}>
          {title}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {caption}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        <Text tabular style={{ fontSize: 15, fontWeight: '600', color: amountColor }}>
          {amount}
        </Text>
        {footer}
      </View>
    </Pressable>
  );
}

function OpenObligationRow({ obligation }: { obligation: ObligationWithRelations }) {
  const theme = useTheme();
  const overdue = obligation.status === 'gecikti';
  const caption = [
    obligation.due_date ? t('counterparties.detail.due', { date: dateFormatter.format(new Date(obligation.due_date)) }) : t('counterparties.detail.noDue'),
    DOCUMENT_TYPE_LABEL[obligation.document_type] ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <LedgerRow
      leading={
        <ObligationIcon
          documentType={obligation.document_type}
          bankCode={obligation.bank_code}
          serviceCode={obligation.service_code}
          fallbackName={obligation.title}
          size={34}
        />
      }
      title={obligation.title}
      caption={caption}
      amount={formatMinorAmount(obligation.remaining_amount_minor, obligation.currency_code)}
      amountColor={overdue ? theme.colors.danger : obligation.direction === 'receivable' ? theme.colors.success : theme.colors.textPrimary}
      footer={<StatusBadge status={obligation.status} />}
      onPress={() => router.push(`/obligations/${obligation.id}`)}
    />
  );
}

const INSTRUMENT_TYPES = new Set(['cek', 'senet']);

// Tuval KisiHareketler: İşlem | Tutar | Bakiye sütunları, aylara gruplu (ay başlığında işlem sayısı ve
// ay sonundaki cari bakiyesi). Ödeme/tahsilat tutarı yeşil; bakiye o satırdan sonraki cari durumudur
// (tek para birimli ekstrede). Çek/senedin vadedeki ödemesi ayrı satır olmaz, durumu çekin satırında yazar.
const TABLE_COLUMNS = { amount: 84, balance: 92 };
const monthFormatter = localeDateFormatter({ month: 'long', year: 'numeric' });

const wholeAmount = (minor: number, currency: string) =>
  formatMinorAmount(minor, currency).replace(zeroFractionPattern(), '');

const signed = (minor: number, currency: string) => `${minor < 0 ? '−' : ''}${wholeAmount(Math.abs(minor), currency)}`;

function StatementTable({ entries }: { entries: StatementEntry[] }) {
  const theme = useTheme();
  // Girdiler en yeniden eskiye sıralı; ay grupları aynı sırayı korur.
  const months: { key: string; label: string; items: StatementEntry[] }[] = [];
  for (const entry of entries) {
    const date = new Date(entry.date);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    let group = months[months.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: upperUi(monthFormatter.format(date)), items: [] };
      months.push(group);
    }
    group.items.push(entry);
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: theme.spacing.md, paddingBottom: 6 }}>
        <Text variant="caption" color="textSecondary" style={{ flex: 1, fontWeight: '600' }}>
          {t('counterparties.detail.colTransaction')}
        </Text>
        <Text variant="caption" color="textSecondary" style={{ width: TABLE_COLUMNS.amount, textAlign: 'right', fontWeight: '600' }}>
          {t('counterparties.detail.colAmount')}
        </Text>
        <Text variant="caption" color="textSecondary" style={{ width: TABLE_COLUMNS.balance, textAlign: 'right', fontWeight: '600' }}>
          {t('counterparties.detail.colBalance')}
        </Text>
      </View>
      <View style={{ borderRadius: theme.radius.group, overflow: 'hidden', backgroundColor: theme.colors.surfacePrimary }}>
        {months.map((month) => {
          // Ay sonundaki bakiye: ayın en yeni satırından sonraki cari durumu.
          const closing = month.items[0];
          return (
            <View key={month.key}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: 8,
                  backgroundColor: theme.colors.backgroundPrimary,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.separator,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary }}>
                  {t('counterparties.detail.monthCount', { month: month.label, count: month.items.length })}
                </Text>
                {closing.runningBalanceMinor !== null ? (
                  <Text tabular style={{ fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary }}>
                    {signed(closing.runningBalanceMinor, 'TRY')}
                  </Text>
                ) : null}
              </View>
              {month.items.map((entry, index) => (
                <StatementTableRow key={entry.key} entry={entry} last={index === month.items.length - 1} />
              ))}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const DONE_STATUSES = new Set(['odendi', 'tahsil_edildi']);

function StatementTableRow({ entry, last }: { entry: StatementEntry; last: boolean }) {
  const theme = useTheme();
  const isInstrument = entry.kind === 'document' && !!entry.documentType && INSTRUMENT_TYPES.has(entry.documentType);
  // Ödeme/tahsilat ve cari lehine işleyen satırlar yeşil (tuval .cok).
  const amountColor = entry.kind === 'payment' ? theme.colors.success : theme.colors.textPrimary;

  const caption = [
    shortDateFormatter.format(new Date(entry.date)),
    isInstrument && entry.dueDate ? t('counterparties.detail.dueLower', { date: shortDateFormatter.format(new Date(entry.dueDate)) }) : entry.subtitle,
    entry.fxRateTryMinor
      ? t(entry.fxRateEstimated ? 'counterparties.detail.rateEstimated' : 'counterparties.detail.rate', { rate: formatMinorAmount(entry.fxRateTryMinor) })
      : entry.currencyCode !== 'TRY'
        ? t('counterparties.detail.rateMissing')
        : null,
    isInstrument && entry.status ? (DONE_STATUSES.has(entry.status) ? OBLIGATION_STATUS_LABEL[entry.status as ObligationStatus] : t('counterparties.detail.pending')) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  function open() {
    if (entry.obligationId) router.push(`/obligations/${entry.obligationId}`);
    else if (entry.transactionId) router.push(`/transactions/${entry.transactionId}`);
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={open}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 58,
        paddingVertical: 8,
        paddingHorizontal: theme.spacing.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors.separator,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '500' }}>
          {entry.title}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {caption}
        </Text>
      </View>
      <Text tabular numberOfLines={1} style={{ width: TABLE_COLUMNS.amount, textAlign: 'right', fontSize: 15, color: amountColor }}>
        {wholeAmount(entry.amountMinor, entry.currencyCode)}
      </Text>
      <Text tabular numberOfLines={1} style={{ width: TABLE_COLUMNS.balance, textAlign: 'right', fontSize: 15, fontWeight: '600' }}>
        {entry.runningBalanceMinor !== null ? signed(entry.runningBalanceMinor, 'TRY') : '—'}
      </Text>
    </Pressable>
  );
}
