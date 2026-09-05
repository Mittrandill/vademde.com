import { useState } from 'react';
import { Alert, InteractionManager } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import {
  ActionSheet,
  Card,
  EmptyState,
  Pagination,
  Pressable,
  Row,
  SectionHeader,
  Stack,
  Text,
} from '@/components/primitives';
import { DetailScaffold } from '@/components/navigation/DetailScaffold';
import {
  FinanceDetailHero,
  FinanceDetailInfoCard,
  FinanceDetailTabs,
} from '@/components/finance/FinanceDetailBlocks';
import { Amount } from '@/components/finance/Amount';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { PersonAvatar } from '@/components/finance/PersonAvatar';
import { DueBreakdown } from '@/components/finance/DueBreakdown';
import { StatusBadge } from '@/components/finance/StatusBadge';
import {
  deleteCounterparty,
  getCounterparty,
  getCounterpartyLedger,
  getCounterpartyTypeLabel,
} from '@/features/counterparties/api';
import {
  listObligations,
  getDueBreakdown,
  ACTIVE_OBLIGATION_STATUSES,
  type ObligationWithRelations,
} from '@/features/obligations/api';
import { listTransactions, type TransactionWithRelations } from '@/features/transactions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';
import { groupByDay } from '@/utils/groupByDay';
import { showSuccessAlert } from '@/utils/alerts';
import type { ValueUnitType } from '@/features/valueUnits/units';

// Tahsilat/Ödeme Ekle → yöntem alt-menüsü. Çek/Senet birer finansal kayıt türüdür
// (obligations.document_type, docs/01-finansal-kayit-modeli.md §3) — borç kaydı şartı
// olmadan doğrudan /obligations/new'e yönlendirilir. Diğerleri anlık/gerçekleşmiş
// hareketlerdir — doğrudan /transactions/new'e yönlendirilir (bkz. app/transactions/new.tsx).
type PaymentMenuDirection = 'tahsilat' | 'odeme';
const QUICK_TRANSACTION_METHODS: Array<{
  key: 'nakit' | 'havale' | 'kredi_karti' | 'online_odeme';
  label: string;
  icon: 'cash-outline' | 'swap-horizontal-outline' | 'card-outline' | 'globe-outline';
}> = [
  { key: 'nakit', label: 'Nakit', icon: 'cash-outline' },
  { key: 'havale', label: 'Banka Havalesi/EFT', icon: 'swap-horizontal-outline' },
  { key: 'kredi_karti', label: 'Kredi Kartı', icon: 'card-outline' },
  { key: 'online_odeme', label: 'Online Ödeme', icon: 'globe-outline' },
];

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

const TAB_PAGE_SIZE = 10;
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
  const [tab, setTab] = useState<DetailTab>('genel');
  const [menuOpen, setMenuOpen] = useState(false);
  const [paymentMenu, setPaymentMenu] = useState<PaymentMenuDirection | null>(null);
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

  // Obligation detayındaki aynı formül: halka, net bakiyenin değil alacak/borç
  // dengesinin görselidir.
  const directionalTotal = (ledger?.receivableMinor ?? 0) + (ledger?.payableMinor ?? 0);
  const receivableShare = directionalTotal > 0 ? (ledger?.receivableMinor ?? 0) / directionalTotal : 0;

  const tabOptions: { key: DetailTab; label: string }[] = [
    { key: 'genel', label: 'Genel' },
    { key: 'kayitlar', label: `Açık Kayıtlar (${allOpenObligations.length})` },
    { key: 'hareketler', label: 'Hareketler' },
  ];
  const infoRows = [
    { label: 'Tür', value: getCounterpartyTypeLabel(counterparty.type) },
    ...(counterparty.phone ? [{ label: 'Telefon', value: counterparty.phone }] : []),
    ...(counterparty.email ? [{ label: 'E-posta', value: counterparty.email }] : []),
    ...(counterparty.tax_number ? [{ label: 'Vergi No', value: counterparty.tax_number }] : []),
    { label: 'Alacak', value: formatMinorAmount(ledger?.receivableMinor ?? 0) },
    { label: 'Borç', value: formatMinorAmount(ledger?.payableMinor ?? 0) },
    { label: 'Geciken', value: formatMinorAmount(ledger?.overdueMinor ?? 0) },
    ...(ledger?.nearestDueDate
      ? [{ label: 'En Yakın Vade', value: dateFormatter.format(new Date(ledger.nearestDueDate)) }]
      : []),
    ...(counterparty.notes ? [{ label: 'Notlar', value: counterparty.notes }] : []),
  ];

  return (
    <>
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
      <FinanceDetailHero
        icon={<PersonAvatar name={counterparty.name} size={44} />}
        eyebrow="CARİ DURUM"
        title={`${counterparty.name} · ${getCounterpartyTypeLabel(counterparty.type)}`}
        amountLabel="CARİ BAKİYE"
        amount={formatMinorAmount(Math.abs(netMinor))}
        amountColor={netColor}
        progress={directionalTotal > 0 ? receivableShare : undefined}
        progressLabel="Alacak payı"
        progressColor={theme.colors.success}
        stats={[
          { label: 'AÇIK KAYIT', value: String(ledger?.openCount ?? 0) },
          { label: 'GECİKEN', value: formatMinorAmount(ledger?.overdueMinor ?? 0) },
          {
            label: 'EN YAKIN VADE',
            value: ledger?.nearestDueDate ? shortDateFormatter.format(new Date(ledger.nearestDueDate)) : 'Yok',
          },
        ]}
      />

      {breakdown && breakdown.payable.remainingTotalMinor > 0 ? (
        <Stack gap="sm">
          <Text variant="caption" color="textSecondary">
            ÖDENECEKLER
          </Text>
          <DueBreakdown data={breakdown.payable} direction="payable" />
        </Stack>
      ) : null}

      {breakdown && breakdown.receivable.remainingTotalMinor > 0 ? (
        <Stack gap="sm">
          <Text variant="caption" color="textSecondary">
            TAHSİL EDİLECEKLER
          </Text>
          <DueBreakdown data={breakdown.receivable} direction="receivable" />
        </Stack>
      ) : null}

      <FinanceDetailTabs options={tabOptions} value={tab} onChange={setTab} />

      {tab === 'genel' ? (
        <FinanceDetailInfoCard
          title="Cari Bilgileri"
          description="İletişim, tür ve finansal özet"
          rows={infoRows}
        />
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
    </DetailScaffold>
    <ActionSheet
      visible={menuOpen}
      title="Cari işlemleri"
      onClose={() => setMenuOpen(false)}
      options={[
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
          label: 'Tahsilat Ekle',
          description: 'Nakit, havale, kart, çek veya senet ile tahsilat işleyin.',
          icon: 'arrow-down-circle-outline',
          onPress: () => setPaymentMenu('tahsilat'),
        },
        {
          key: 'payment',
          label: 'Ödeme Ekle',
          description: 'Nakit, havale, kart, çek veya senet ile ödeme işleyin.',
          icon: 'arrow-up-circle-outline',
          onPress: () => setPaymentMenu('odeme'),
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

    <ActionSheet
      visible={paymentMenu !== null}
      title={paymentMenu === 'tahsilat' ? 'Tahsilat Yöntemi' : 'Ödeme Yöntemi'}
      onClose={() => setPaymentMenu(null)}
      options={[
        ...QUICK_TRANSACTION_METHODS.map((method) => ({
          key: method.key,
          label: method.label,
          icon: method.icon,
          onPress: () =>
            router.push({
              pathname: '/transactions/new',
              params: {
                direction: paymentMenu === 'tahsilat' ? 'income' : 'expense',
                counterpartyId: counterparty.id,
                paymentMethod: method.key,
                description: `${counterparty.name} — ${method.label}`,
              },
            }),
        })),
        {
          key: 'cek',
          label: 'Çek',
          description: 'Yeni bir çek kaydı oluşturun.',
          icon: 'document-text-outline',
          onPress: () =>
            router.push({
              pathname: '/obligations/new',
              params: {
                type: 'cek',
                direction: paymentMenu === 'tahsilat' ? 'receivable' : 'payable',
                counterpartyId: counterparty.id,
              },
            }),
        },
        {
          key: 'senet',
          label: 'Senet',
          description: 'Yeni bir senet kaydı oluşturun.',
          icon: 'document-text-outline',
          onPress: () =>
            router.push({
              pathname: '/obligations/new',
              params: {
                type: 'senet',
                direction: paymentMenu === 'tahsilat' ? 'receivable' : 'payable',
                counterpartyId: counterparty.id,
              },
            }),
        },
      ]}
    />
    </>
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
