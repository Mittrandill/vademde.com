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
  GroupedRow,
  GroupedRowIcon,
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
import { DueBreakdown } from '@/components/finance/DueBreakdown';
import { StatusBadge } from '@/components/finance/StatusBadge';
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
  getDueBreakdown,
  ACTIVE_OBLIGATION_STATUSES,
  type ObligationWithRelations,
} from '@/features/obligations/api';
import { listReceiptArchive, useDocumentArchiveAccess } from '@/features/receipts/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';
import { groupByDay } from '@/utils/groupByDay';
import { showSuccessAlert } from '@/utils/alerts';
import type { ValueUnitType } from '@/features/valueUnits/units';

// Tahsilat Al / Ödeme Yap → /payments/new (bkz. features/payments/api.ts settleObligations).
// Önceden "Çek/Senet" seçimi Borç/Alacak formuna gidip bağımsız yeni bir kayıt açıyordu; faturaya
// çek verilince borç ikiye katlanıyordu. Yöntem (nakit, havale, kart, çek, senet) artık formun
// içinde seçilir ve her yöntem seçilen açık kayıtları kapatır.

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

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
      showSuccessAlert('Cari kaydı başarıyla silindi.', () => {
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
        'Silinemedi',
        'Bu kişi/firma işlem veya borç/alacak kayıtlarında kullanılıyor. Önce ilişkili kayıtları güncelleyin.'
      );
    },
  });

  function confirmDeleteCounterparty() {
    Alert.alert('Cariyi Sil', 'Bu kişi/firma kalıcı olarak silinecek. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deleteCounterpartyMutation.mutate() },
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

  // docs/01-finansal-kayit-modeli.md §3.2.1 — personel maaşı/kira gibi tekrarlayan
  // kayıtlarda cari bakiyesi tüm gelecek vadeleri içerir. Kullanıcının "4 aylık maaşın
  // tamamını bugünün borcu olarak görmek normal mi?" sorusunun cevabı: rakam doğru ama tek
  // başına eksik — bu kırılım hangi kısmın gecikmiş, hangisinin bu ay ödeneceğini ayırır.
  const dueBreakdownQuery = useQuery({
    queryKey:
      activeWorkspaceId && id
        ? queryKeys.dueBreakdown(activeWorkspaceId, `counterparty:${id}`)
        : ['due-breakdown', 'disabled'],
    queryFn: () =>
      getDueBreakdown({ workspaceId: activeWorkspaceId as string, counterpartyId: id as string }),
    enabled: !!activeWorkspaceId && !!id,
  });
  const breakdown = dueBreakdownQuery.data;

  if (!counterparty) {
    return (
      <DetailScaffold
        header={{ title: '' }}
        isLoading
        error={counterpartyQuery.error}
        errorFallbackMessage="Kayıt yüklenemedi"
      >
        {null}
      </DetailScaffold>
    );
  }

  const allOpenObligations = openObligationsQuery.data ?? [];
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
  const transactionSections = groupByDay(pagedEntries, (item) => item.date);

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
    { key: 'kayitlar', label: `Açık kayıtlar (${allOpenObligations.length})` },
    { key: 'hareketler', label: 'İşlemler' },
    { key: 'genel', label: 'Bilgiler' },
  ];
  // Faturayı kapatmış çek/senetler cari bakiyesine girmez; vadede hareket edecek tutar olarak not düşülür.
  const instrumentParts = [
    ledger?.instrumentPayableMinor
      ? `bu cariye verilen ${formatMinorAmount(ledger.instrumentPayableMinor)} çek/senet vadesinde hesabından ödenecek`
      : null,
    ledger?.instrumentReceivableMinor
      ? `bu cariden alınan ${formatMinorAmount(ledger.instrumentReceivableMinor)} çek/senet vadesinde tahsil edilecek`
      : null,
  ].filter((part): part is string => !!part);
  const instrumentNoteBody = instrumentParts.join('; ');
  const instrumentNote = instrumentNoteBody
    ? `${instrumentNoteBody.charAt(0).toLocaleUpperCase('tr-TR')}${instrumentNoteBody.slice(1)} — cari bakiyesine dahil değil.`
    : null;

  const infoRows = [
    { label: 'Tür', value: getCounterpartyTypeLabel(counterparty.type) },
    ...(counterparty.phone ? [{ label: 'Telefon', value: counterparty.phone }] : []),
    ...(counterparty.email ? [{ label: 'E-posta', value: counterparty.email }] : []),
    ...(counterparty.tax_number ? [{ label: 'Vergi No', value: counterparty.tax_number }] : []),
    { label: 'Alacak', value: formatMinorAmount(ledger?.receivableMinor ?? 0) },
    { label: 'Borç', value: formatMinorAmount(ledger?.payableMinor ?? 0) },
    { label: 'Geciken', value: formatMinorAmount(ledger?.overdueMinor ?? 0) },
    // Faturayı kapatmış çek/senet cari bakiyesine girmez (cari çek verilince kapanır); vadede
    // hesaptan ödenecek/tahsil edilecek tutar olarak burada ayrıca görünür.
    ...(ledger?.instrumentPayableMinor
      ? [{ label: 'Verilen çek/senet (vadede ödenecek)', value: formatMinorAmount(ledger.instrumentPayableMinor) }]
      : []),
    ...(ledger?.instrumentReceivableMinor
      ? [{ label: 'Alınan çek/senet (vadede tahsil)', value: formatMinorAmount(ledger.instrumentReceivableMinor) }]
      : []),
    ...(ledger?.nearestDueDate
      ? [{ label: 'En Yakın Vade', value: dateFormatter.format(new Date(ledger.nearestDueDate)) }]
      : []),
    ...(counterparty.notes ? [{ label: 'Notlar', value: counterparty.notes }] : []),
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
          accessibilityLabel: 'Cari işlemleri',
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
            {[getCounterpartyTypeLabel(counterparty.type), counterparty.tax_number ? `VKN ${counterparty.tax_number}` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Stack>
      </View>

      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row' }}>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="caption" color="textSecondary">
              Net bakiye
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
              {settled ? 'Hesap denk' : owesUs ? 'Size borçlu' : 'Siz borçlusunuz'}
            </Text>
          </Stack>
          <Stack gap="xxs" style={{ alignItems: 'flex-end' }}>
            <Text variant="caption" color="textSecondary">
              En yakın vade
            </Text>
            <Text style={{ fontSize: 15, fontWeight: '600' }}>
              {ledger?.nearestDueDate ? shortDateFormatter.format(new Date(ledger.nearestDueDate)) : 'Yok'}
            </Text>
          </Stack>
        </View>
        <View style={{ height: 1, backgroundColor: theme.colors.separator }} />
        <View style={{ flexDirection: 'row' }}>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="caption" color="textSecondary">
              Borç
            </Text>
            <Text tabular style={{ fontSize: 15, fontWeight: '600' }}>
              {formatMinorAmount(ledger?.payableMinor ?? 0)}
            </Text>
          </Stack>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="caption" color="textSecondary">
              Alacak
            </Text>
            <Text tabular style={{ fontSize: 15, fontWeight: '600', color: theme.colors.success }}>
              {formatMinorAmount(ledger?.receivableMinor ?? 0)}
            </Text>
          </Stack>
          <Stack gap="xxs" style={{ alignItems: 'flex-end' }}>
            <Text variant="caption" color="textSecondary">
              Geciken
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
          label="Ödeme yap"
          primary
          onPress={() => router.push({ pathname: '/payments/new', params: { direction: 'payable', counterpartyId: counterparty.id } })}
        />
        <QuickAction
          icon="arrow-down"
          label="Tahsilat al"
          onPress={() => router.push({ pathname: '/payments/new', params: { direction: 'receivable', counterpartyId: counterparty.id } })}
        />
        <QuickAction
          icon="document-text"
          label="Alış faturası"
          onPress={() =>
            router.push({ pathname: '/obligations/new', params: { type: 'fatura', direction: 'payable', counterpartyId: counterparty.id } })
          }
        />
        <QuickAction
          icon="receipt"
          label="Satış faturası"
          onPress={() =>
            router.push({ pathname: '/obligations/new', params: { type: 'fatura', direction: 'receivable', counterpartyId: counterparty.id } })
          }
        />
      </View>

      {breakdown && breakdown.payable.remainingTotalMinor > 0 ? (
        <Stack gap="sm">
          <Text variant="label" color="textSecondary">
            ÖDENECEKLER
          </Text>
          <DueBreakdown data={breakdown.payable} direction="payable" />
        </Stack>
      ) : null}

      {breakdown && breakdown.receivable.remainingTotalMinor > 0 ? (
        <Stack gap="sm">
          <Text variant="label" color="textSecondary">
            TAHSİL EDİLECEKLER
          </Text>
          <DueBreakdown data={breakdown.receivable} direction="receivable" />
        </Stack>
      ) : null}

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
                    <Text variant="cardTitle">Ödeme dekontları</Text>
                    <Text variant="caption" color="textSecondary">
                      Dekontları ödemeye ekleyip arşivlemek Plus planında.
                    </Text>
                  </Stack>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </Row>
              </Card>
            </Pressable>
          ) : receipts.length > 0 ? (
            <Stack gap="xs">
              <SectionHeader title="Ödeme Dekontları" />
              {receipts.slice(0, 3).map((item) => (
                <ReceiptRow key={item.documentId} item={item} hideCounterparty />
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/documents/archive', params: { counterpartyId: id as string } })}
              >
                <Row gap="xs" align="center" style={{ justifyContent: 'center', paddingVertical: theme.spacing.xs }}>
                  <Text variant="caption" style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>
                    Tümünü gör ({receipts.length})
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.colors.textPrimary} />
                </Row>
              </Pressable>
            </Stack>
          ) : null}
          <FinanceDetailInfoCard
            title="Cari Bilgileri"
            description="İletişim, tür ve finansal özet"
            rows={infoRows}
          />
        </Stack>
      ) : tab === 'kayitlar' ? (
        <Stack gap="md">
          {openObligations.length === 0 ? (
            <EmptyState icon="checkmark-circle-outline" message="Açık borç veya alacak yok." />
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
          {statementQuery.isPending ? null : transactionSections.length === 0 ? (
            <EmptyState icon="receipt-outline" message="Bu cariyle henüz hareket yok." />
          ) : (
            <Stack gap="md">
              {transactionSections.map((section) => (
                <Stack gap="xs" key={section.title}>
                  <SectionHeader title={section.title} />
                  <Group>
                    {section.data.map((item) => (
                      <StatementRow key={item.key} entry={item} />
                    ))}
                  </Group>
                </Stack>
              ))}
            </Stack>
          )}
          {transactionsTotalPages > 1 ? (
            <Pagination page={effectiveTransactionsPage} totalPages={transactionsTotalPages} onChange={setTransactionsPage} />
          ) : null}
        </Stack>
      )}
    </DetailScaffold>
    <ActionSheet
      visible={menuOpen}
      title="Cari işlemleri"
      onClose={() => setMenuOpen(false)}
      options={[
        ...(owesUs
          ? [
              {
                key: 'reminder',
                label: 'Hatırlatma Gönder',
                description: 'WhatsApp, SMS veya e-posta ile alacağı hatırlat.',
                icon: 'notifications-outline' as const,
                onPress: () => setReminderOpen(true),
              },
            ]
          : []),
        {
          key: 'sales-invoice',
          label: 'Satış Faturası Oluştur',
          description: 'Bu cariye kesilen bir alacak faturası ekleyin.',
          icon: 'document-text-outline',
          onPress: () =>
            router.push({
              pathname: '/obligations/new',
              params: { type: 'fatura', direction: 'receivable', counterpartyId: counterparty.id },
            }),
        },
        {
          key: 'purchase-invoice',
          label: 'Alış Faturası Oluştur',
          description: 'Bu cariden gelen bir borç faturası ekleyin.',
          icon: 'document-text-outline',
          onPress: () =>
            router.push({
              pathname: '/obligations/new',
              params: { type: 'fatura', direction: 'payable', counterpartyId: counterparty.id },
            }),
        },
        {
          key: 'collection',
          label: 'Tahsilat Al',
          description: 'Nakit, havale, kart, çek veya senet ile tahsilat işleyin.',
          icon: 'arrow-down-circle-outline',
          onPress: () =>
            router.push({ pathname: '/payments/new', params: { direction: 'receivable', counterpartyId: counterparty.id } }),
        },
        {
          key: 'payment',
          label: 'Ödeme Yap',
          description: 'Nakit, havale, kart, çek veya senet ile ödeme işleyin.',
          icon: 'arrow-up-circle-outline',
          onPress: () =>
            router.push({ pathname: '/payments/new', params: { direction: 'payable', counterpartyId: counterparty.id } }),
        },
        {
          key: 'edit',
          label: 'Düzenle',
          description: 'Cari bilgilerini güncelleyin.',
          icon: 'create-outline',
          onPress: () => router.push({ pathname: '/counterparties/new', params: { id: counterparty.id } }),
        },
        {
          key: 'delete',
          label: deleteCounterpartyMutation.isPending ? 'Siliniyor…' : 'Sil',
          description: 'Cariyi kalıcı olarak kaldırın.',
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

function OpenObligationRow({ obligation }: { obligation: ObligationWithRelations }) {
  const theme = useTheme();
  const overdue = obligation.status === 'gecikti';
  return (
    <GroupedRow
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
      subtitle={obligation.due_date ? shortDateFormatter.format(new Date(obligation.due_date)) : 'Vade yok'}
      chevron={false}
      trailing={
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text tabular style={{ fontSize: 15, fontWeight: '600', color: overdue ? theme.colors.danger : theme.colors.textPrimary }}>
            {formatMinorAmount(obligation.remaining_amount_minor, obligation.currency_code)}
          </Text>
          <StatusBadge status={obligation.status} />
        </View>
      }
      onPress={() => router.push(`/obligations/${obligation.id}`)}
    />
  );
}

// Cari ekstresi satırı. Fatura/borç kaydı kendi belge ikonuyla, ödeme/tahsilat ok ikonuyla,
// kayda bağlı olmayan hareket nötr ikonla gösterilir. Tutarın işareti cari bakiyesine etkisidir;
// altındaki "Bakiye" satırı o satırdan sonraki cari durumudur (tek para birimli ekstrede).
function StatementRow({ entry }: { entry: StatementEntry }) {
  const theme = useTheme();
  const effect = entry.balanceEffectMinor;
  const amountColor =
    effect > 0 ? theme.colors.success : effect < 0 ? theme.colors.textPrimary : theme.colors.textSecondary;
  const sign = effect > 0 ? '+' : effect < 0 ? '−' : '';
  const running = entry.runningBalanceMinor;

  function open() {
    if (entry.obligationId) router.push(`/obligations/${entry.obligationId}`);
    else if (entry.transactionId) router.push(`/transactions/${entry.transactionId}`);
  }

  return (
    <GroupedRow
      leading={
        entry.kind === 'document' && entry.documentType ? (
          <ObligationIcon documentType={entry.documentType} fallbackName={entry.title} size={34} />
        ) : (
          <GroupedRowIcon
            name={entry.kind === 'payment' ? (entry.direction === 'receivable' ? 'arrow-down' : 'arrow-up') : 'swap-vertical'}
            tone={entry.kind === 'payment' ? 'success' : 'default'}
          />
        )
      }
      title={entry.title}
      subtitle={entry.subtitle || undefined}
      chevron={false}
      trailing={
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text tabular style={{ fontSize: 15, fontWeight: '600', color: amountColor }}>
            {sign}
            {formatMinorAmount(entry.amountMinor, entry.currencyCode)}
          </Text>
          {running !== null ? (
            <Text variant="caption" color="textSecondary" tabular>
              Bakiye {running < 0 ? '−' : ''}
              {formatMinorAmount(Math.abs(running), entry.currencyCode)}
            </Text>
          ) : entry.balanceEffectMinor === 0 ? (
            <Text variant="caption" color="textSecondary">
              bakiyeyi etkilemez
            </Text>
          ) : null}
        </View>
      }
      onPress={open}
    />
  );
}
