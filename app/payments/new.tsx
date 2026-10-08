import { useState } from 'react';
import { InteractionManager, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useReflowKey } from '@/services/reflow';
import {
  BigAmountInput,
  Button,
  Card,
  DateField,
  FieldGroup,
  FormRow,
  Pill,
  Pressable,
  Row,
  SegmentedControl,
  Stack,
  Text,
  TextField,
} from '@/components/primitives';
import { AccountAvatar, AccountPicker } from '@/components/finance/AccountPicker';
import { BankPicker } from '@/components/finance/BankPicker';
import { CounterpartyPicker } from '@/components/finance/CounterpartyPicker';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { ReceiptAttachField } from '@/components/finance/ReceiptAttachField';
import { listAccounts, type Account } from '@/features/accounts/api';
import { listCounterparties } from '@/features/counterparties/api';
import { getAccountBalances } from '@/features/reports/api';
import {
  ACTIVE_OBLIGATION_STATUSES,
  getObligation,
  listObligations,
  type ObligationWithRelations,
} from '@/features/obligations/api';
import { DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import {
  allocateAcrossObligations,
  isCashlessMethod,
  isInstrumentMethod,
  settleObligations,
  type SettlementMethod,
} from '@/features/payments/api';
import { attachReceiptFile, useDocumentArchiveAccess, type PendingReceipt } from '@/features/receipts/api';
import { getValueUnit } from '@/features/valueUnits/units';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { addMonthsToIsoDate } from '@/utils/installmentPlan';
import { formatAmountInput, formatMinorAmount, parseValueUnitAmountToMinor } from '@/utils/money';
import { showErrorAlert, showSaveSuccess } from '@/utils/alerts';
import { invalidatePaymentRelatedQueries, queryKeys } from '@/services/queryKeys';
import { syncObligationReminder } from '@/services/notifications';

type SettlementDirection = 'payable' | 'receivable';

const METHODS: { key: SettlementMethod; label: string }[] = [
  { key: 'havale', label: 'Havale/EFT' },
  { key: 'nakit', label: 'Nakit' },
  { key: 'kredi_karti', label: 'Kredi Kartı' },
  { key: 'online_odeme', label: 'Online' },
  { key: 'cek', label: 'Çek' },
  { key: 'senet', label: 'Senet' },
  // Yalnızca uygun kayıt varken gösterilir (bkz. availableMethods).
  { key: 'ciro', label: 'Çek Ciro' },
  { key: 'mahsup', label: 'Mahsup' },
];

// Kısa tarih etiketi — kayıt satırlarında vade gösterimi için.
const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function minorToInput(amountMinor: number, unitCode: string): string {
  const precision = getValueUnit(unitCode).precision;
  return formatAmountInput((amountMinor / 10 ** precision).toFixed(precision).replace('.', ','), precision);
}

// Ödeme Yap / Tahsilat Al — bkz. features/payments/api.ts settleObligations.
//
// Önceden "Ödeme Ekle → Çek" kullanıcıyı Borç/Alacak formuna gönderiyor ve bağımsız yeni bir borç
// açıyordu: 30.000 faturaya 20.000 çek verilince borç 50.000'e çıkıyordu. Bu ekranda yöntem ne olursa
// olsun seçilen kayıtlar tutar kadar (kısmen de olabilir) kapanır; nakit/havale/kartta para seçilen
// hesaptan hemen hareket eder, çek/senette ise vadeli bir çek/senet kaydı açılır ve para vadede
// o kayıt ödendiğinde/tahsil edildiğinde hareket eder.
export default function SettlementScreen() {
  const reflowKey = useReflowKey();
  const params = useLocalSearchParams<{
    direction?: string;
    counterpartyId?: string;
    obligationId?: string;
    method?: string;
    amountMinor?: string;
    accountId?: string;
    date?: string;
    description?: string;
    /** Alınmış bir çek/senedin detayından "Ciro Et": o çek seçili, yöntem Çek Ciro. */
    endorseId?: string;
  }>();
  const endorseId = typeof params.endorseId === 'string' ? params.endorseId : undefined;
  const preselectedObligationId = typeof params.obligationId === 'string' ? params.obligationId : undefined;

  // Kayıt detayından gelindiyse (obligationId) cari, yön ve para birimi o kayıttan okunur.
  const preselectedQuery = useQuery({
    queryKey: ['obligation-plain', preselectedObligationId],
    queryFn: () => getObligation(preselectedObligationId as string),
    enabled: !!preselectedObligationId,
  });

  if (preselectedObligationId && !preselectedQuery.data) {
    return <SafeAreaView key={reflowKey} style={{ flex: 1 }} />;
  }

  const preselected = preselectedQuery.data ?? null;
  const direction: SettlementDirection = endorseId
    ? 'payable'
    : ((preselected?.direction as SettlementDirection | undefined) ??
      (params.direction === 'receivable' ? 'receivable' : 'payable'));
  const method = endorseId
    ? 'ciro'
    : METHODS.some((m) => m.key === params.method)
      ? (params.method as SettlementMethod)
      : undefined;
  const amountMinor = params.amountMinor ? Number(params.amountMinor) : undefined;

  return (
    <SettlementForm
      key={reflowKey}
      direction={direction}
      initialCounterpartyId={preselected?.counterparty_id ?? (typeof params.counterpartyId === 'string' ? params.counterpartyId : null)}
      preselectedObligationId={preselected?.id ?? null}
      currencyCode={preselected?.currency_code ?? 'TRY'}
      initialMethod={method}
      initialAmountMinor={amountMinor && Number.isFinite(amountMinor) && amountMinor > 0 ? amountMinor : undefined}
      initialAccountId={typeof params.accountId === 'string' ? params.accountId : undefined}
      initialDate={typeof params.date === 'string' ? params.date : undefined}
      initialDescription={typeof params.description === 'string' ? params.description : undefined}
      initialSourceIds={endorseId ? [endorseId] : undefined}
    />
  );
}

interface SettlementFormProps {
  direction: SettlementDirection;
  initialCounterpartyId: string | null;
  preselectedObligationId: string | null;
  currencyCode: string;
  initialMethod?: SettlementMethod;
  initialAmountMinor?: number;
  initialAccountId?: string;
  initialDate?: string;
  initialDescription?: string;
  initialSourceIds?: string[];
}

function SettlementForm({
  direction,
  initialCounterpartyId,
  preselectedObligationId,
  currencyCode,
  initialMethod,
  initialAmountMinor,
  initialAccountId,
  initialDate,
  initialDescription,
  initialSourceIds,
}: SettlementFormProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const isPayable = direction === 'payable';
  const precision = getValueUnit(currencyCode).precision;

  const [counterpartyId, setCounterpartyId] = useState<string | null>(initialCounterpartyId);
  const [method, setMethod] = useState<SettlementMethod>(initialMethod ?? 'havale');
  const [amount, setAmount] = useState(initialAmountMinor ? minorToInput(initialAmountMinor, currencyCode) : '');
  // Kullanıcı tutarı elle değiştirmediyse, seçilen kayıtların kalan toplamı önerilir.
  const [amountTouched, setAmountTouched] = useState(!!initialAmountMinor);
  const [dateStr, setDateStr] = useState(initialDate ?? todayIso());
  const [accountId, setAccountId] = useState<string | null>(initialAccountId ?? null);
  const [description, setDescription] = useState(initialDescription ?? '');
  // null = kullanıcı henüz seçim yapmadı → varsayılan seçim uygulanır (aşağıda).
  const [selectedIds, setSelectedIds] = useState<string[] | null>(preselectedObligationId ? [preselectedObligationId] : null);
  // Mahsupta ters yöndeki kayıtlar, ciroda portföydeki çek/senetler. null = varsayılan seçim.
  const [sourceIds, setSourceIds] = useState<string[] | null>(initialSourceIds ?? null);

  // Çek/senet alanları
  const [instrumentNo, setInstrumentNo] = useState('');
  const [bankCode, setBankCode] = useState<string | null>(null);
  const [firstDueDate, setFirstDueDate] = useState(addMonthsToIsoDate(todayIso(), 1));
  const [dueCount, setDueCount] = useState(1);
  const [instrumentAccountId, setInstrumentAccountId] = useState<string | null>(null);

  const archive = useDocumentArchiveAccess();
  const [receipt, setReceipt] = useState<PendingReceipt | null>(null);

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const counterpartiesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.counterparties(activeWorkspaceId) : ['counterparties', 'disabled'],
    queryFn: () => listCounterparties(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const openQuery = useQuery({
    queryKey:
      activeWorkspaceId && counterpartyId
        ? [activeWorkspaceId, 'obligations', 'settlement-open', counterpartyId, direction]
        : ['settlement-open', 'disabled'],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        counterpartyId: counterpartyId as string,
        direction,
        statuses: ACTIVE_OBLIGATION_STATUSES,
        pageSize: 100,
      }),
    enabled: !!activeWorkspaceId && !!counterpartyId,
  });

  // Mahsup: bu cariyle ters yöndeki açık kayıtlar (ör. tedarikçiye yapılmış ön ödeme/avans).
  const oppositeDirection: SettlementDirection = isPayable ? 'receivable' : 'payable';
  const oppositeQuery = useQuery({
    queryKey:
      activeWorkspaceId && counterpartyId
        ? [activeWorkspaceId, 'obligations', 'settlement-open', counterpartyId, oppositeDirection]
        : ['settlement-open-opposite', 'disabled'],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        counterpartyId: counterpartyId as string,
        direction: oppositeDirection,
        statuses: ACTIVE_OBLIGATION_STATUSES,
        pageSize: 100,
      }),
    enabled: !!activeWorkspaceId && !!counterpartyId,
  });
  // Ciro: portföydeki (tahsil edilmemiş) alınmış çek/senetler — hangi müşteriden alındığı fark etmez.
  const portfolioQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'obligations', 'cheque-portfolio'] : ['cheque-portfolio', 'disabled'],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        direction: 'receivable',
        statuses: ACTIVE_OBLIGATION_STATUSES,
        pageSize: 200,
      }),
    enabled: !!activeWorkspaceId && isPayable,
  });
  const offsetSources = (oppositeQuery.data ?? []).filter(
    (o) => o.currency_code === currencyCode && o.remaining_amount_minor > 0
  );
  const portfolio = (portfolioQuery.data ?? []).filter(
    (o) =>
      (o.document_type === 'cek' || o.document_type === 'senet') &&
      o.currency_code === currencyCode &&
      o.remaining_amount_minor > 0
  );
  const availableMethods = METHODS.filter((m) =>
    m.key === 'mahsup' ? offsetSources.length > 0 : m.key === 'ciro' ? isPayable && portfolio.length > 0 : true
  );

  const instrument = isInstrumentMethod(method);
  const cashless = isCashlessMethod(method);
  const sourceList = method === 'mahsup' ? offsetSources : method === 'ciro' ? portfolio : [];
  // Mahsupta ters yöndeki tüm kayıtlar varsayılan seçilidir; ciroda hangi çekin verileceğini
  // kullanıcı seçer.
  const effectiveSourceIds = sourceIds ?? (method === 'mahsup' ? offsetSources.map((o) => o.id) : []);
  const selectedSources = sourceList.filter((o) => effectiveSourceIds.includes(o.id));
  const sourceTotalMinor = selectedSources.reduce((sum, o) => sum + o.remaining_amount_minor, 0);
  // Aynı para birimindeki açık kayıtlar (en eski vade önce — listObligations varsayılanı).
  // Çek/senetle ödemede başka bir çek/senet kapatılmaz (çek yenileme ayrı bir akıştır).
  const openRecords: ObligationWithRelations[] = (openQuery.data ?? []).filter(
    (o) =>
      o.currency_code === currencyCode &&
      o.remaining_amount_minor > 0 &&
      (!instrument || (o.document_type !== 'cek' && o.document_type !== 'senet'))
  );

  // Varsayılan seçim: kayıt detayından gelindiyse yalnızca o kayıt, aksi halde tüm açık kayıtlar
  // (tutar en eski vadeden başlayarak dağıtılır; kullanıcı istediğini çıkarabilir).
  const effectiveSelectedIds = selectedIds ?? openRecords.map((o) => o.id);
  const selectedRecords = openRecords.filter((o) => effectiveSelectedIds.includes(o.id));
  const selectedRemainingMinor = selectedRecords.reduce((sum, o) => sum + o.remaining_amount_minor, 0);

  // Ciroda tutar seçilen çeklerin toplamıdır (çek bölünerek verilmez). Mahsupta en fazla iki
  // tarafın küçüğü kadar kapatılabilir.
  const offsetCapMinor = Math.min(selectedRemainingMinor, sourceTotalMinor);
  const suggestedMinor =
    method === 'ciro' ? sourceTotalMinor : method === 'mahsup' ? offsetCapMinor : selectedRemainingMinor;
  const displayAmount =
    method === 'ciro'
      ? sourceTotalMinor > 0
        ? minorToInput(sourceTotalMinor, currencyCode)
        : ''
      : amountTouched
        ? amount
        : suggestedMinor > 0
          ? minorToInput(suggestedMinor, currencyCode)
          : '';
  const parsedAmountMinor = parseValueUnitAmountToMinor(displayAmount, currencyCode);
  const amountMinor =
    method === 'mahsup' && parsedAmountMinor ? Math.min(parsedAmountMinor, offsetCapMinor) : parsedAmountMinor;
  const allocation =
    amountMinor && amountMinor > 0 ? allocateAcrossObligations(amountMinor, selectedRecords) : null;

  // Hesap seçenekleri yönteme göre daraltılır: ödemede POS'tan para çıkmaz; kredi kartı yöntemi
  // yalnızca kartlarla, diğer ödeme yöntemleri yalnızca gerçek bakiyesi olan hesaplarla yapılır.
  // Tahsilatta kart ile tahsilat POS/banka hesabına girer.
  const accounts = (accountsQuery.data ?? []).filter((a) => a.currency_code === currencyCode);
  const methodAccounts: Account[] = accounts.filter((a) => {
    if (isPayable) {
      if (a.type === 'pos') return false;
      return method === 'kredi_karti' ? a.type === 'credit_card' : a.type !== 'credit_card';
    }
    if (a.type === 'credit_card') return false;
    return method === 'kredi_karti' ? a.type === 'pos' || a.type === 'bank' : true;
  });
  const instrumentAccounts = accounts.filter((a) => a.type === 'bank' || a.type === 'cash');

  // Senet birden çok vadeli olabilir: tutar vadelere eşit bölünür (kuruş farkı son vadeye),
  // vadeler ilk vadeden itibaren aylık ilerler. Çekte tek vade vardır.
  const effectiveDueCount = method === 'senet' ? dueCount : 1;
  const dueRows: { dueDate: string; amountMinor: number }[] = [];
  if (amountMinor && amountMinor > 0) {
    const base = Math.floor(amountMinor / effectiveDueCount);
    for (let index = 0; index < effectiveDueCount; index += 1) {
      dueRows.push({
        dueDate: addMonthsToIsoDate(firstDueDate, index),
        amountMinor: index === effectiveDueCount - 1 ? amountMinor - base * (effectiveDueCount - 1) : base,
      });
    }
  }

  const instrumentLabel = method === 'cek' ? 'Çek' : 'Senet';
  const counterpartyName = counterpartiesQuery.data?.find((c) => c.id === counterpartyId)?.name ?? null;
  // Hesap satırında güncel bakiye (tuval OdemeKaydet: "Bakiye ₺31.400,00").
  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.reportAccountBalances(activeWorkspaceId) : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const balanceByAccount = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b]));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !counterpartyId) throw new Error('Kişi / firma seçin');
      if (!amountMinor || amountMinor <= 0) throw new Error('Tutar okunamadı, kontrol edin');
      const parsedDate = new Date(dateStr);
      if (Number.isNaN(parsedDate.getTime())) throw new Error('Tarih okunamadı, kontrol edin');
      if (instrument && dueRows.some((row) => Number.isNaN(new Date(row.dueDate).getTime()))) {
        throw new Error('Vade tarihi okunamadı, kontrol edin');
      }

      const result = await settleObligations({
        workspaceId: activeWorkspaceId,
        direction,
        counterpartyId,
        counterpartyName,
        currencyCode,
        amountMinor,
        paidAt: parsedDate.toISOString(),
        method,
        targets: selectedRecords,
        sources: selectedSources,
        accountId: cashless ? null : accountId,
        description: description.trim() || null,
        instrument: instrument
          ? {
              title: `${instrumentLabel}${counterpartyName ? ` — ${counterpartyName}` : ''}`,
              bankCode: method === 'cek' ? bankCode : null,
              documentNo: instrumentNo.trim() || null,
              accountId: instrumentAccountId,
              dueDates: dueRows,
            }
          : null,
      });

      if (result.instrumentObligation) {
        await syncObligationReminder(activeWorkspaceId, result.instrumentObligation).catch(() => undefined);
      }
      for (const { obligation } of [...result.allocations, ...selectedSources.map((o) => ({ obligation: o }))]) {
        const fresh = await getObligation(obligation.id).catch(() => null);
        if (fresh) await syncObligationReminder(activeWorkspaceId, fresh).catch(() => undefined);
      }

      // Dekont yalnızca gerçek para hareketinde (ilk harekete) bağlanır; yüklenemezse ödeme geri
      // alınmaz, kullanıcıya bildirilir.
      let receiptFailed = false;
      if (receipt && !cashless && result.transactionIds[0]) {
        try {
          await attachReceiptFile({
            workspaceId: activeWorkspaceId,
            ...receipt,
            transactionId: result.transactionIds[0],
            obligationId: result.allocations[0]?.obligation.id ?? null,
            amountMinor,
            currencyCode,
          });
        } catch {
          receiptFailed = true;
        }
      }
      return { ...result, receiptFailed };
    },
    onSuccess: (result) => {
      const closedCount = result.allocations.length;
      const advanceText =
        result.leftoverMinor > 0
          ? ` Artan ${formatMinorAmount(result.leftoverMinor, currencyCode)} cariye ${isPayable ? 'ön ödeme (alacak)' : 'alınan avans (borç)'} olarak yazıldı; sonraki faturadan Mahsup ile düşebilirsin.`
          : '';
      const base =
        method === 'mahsup'
          ? `${closedCount} kayıt mahsup edildi. Para hareketi oluşmadı.`
          : method === 'ciro'
            ? `${selectedSources.length} çek/senet ciro edildi${closedCount > 0 ? `, ${closedCount} kayıt kapatıldı` : ''}.${advanceText}`
            : instrument
              ? `${instrumentLabel} kaydedildi${closedCount > 0 ? ` ve ${closedCount} kayıt bu tutar kadar kapatıldı` : ''}. Para, ${instrumentLabel.toLocaleLowerCase('tr-TR')} vadesinde ${isPayable ? 'ödendiğinde hesaptan çıkar' : 'tahsil edildiğinde hesaba girer'}.${advanceText}`
              : `${isPayable ? 'Ödeme' : 'Tahsilat'} kaydedildi${closedCount > 0 ? `, ${closedCount} kayda uygulandı` : ''}.${advanceText}`;
      const message = result.receiptFailed ? `${base} Dekont yüklenemedi; hareketi düzenleyerek yeniden ekleyebilirsiniz.` : base;
      showSaveSuccess(message, () => router.back(), () => {
        InteractionManager.runAfterInteractions(() => {
          if (activeWorkspaceId) invalidatePaymentRelatedQueries(queryClient, activeWorkspaceId);
        });
      });
    },
    onError: (error) => showErrorAlert(error),
  });

  function toggleRecord(id: string) {
    setSelectedIds((prev) => {
      const current = prev ?? openRecords.map((o) => o.id);
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    });
  }

  function toggleSource(id: string) {
    setSourceIds((prev) => {
      const current = prev ?? effectiveSourceIds;
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    });
  }

  const canSubmit =
    !!counterpartyId &&
    !!amountMinor &&
    amountMinor > 0 &&
    (method === 'ciro'
      ? selectedSources.length > 0
      : method === 'mahsup'
        ? selectedSources.length > 0 && selectedRecords.length > 0
        : instrument
          ? dueRows.length > 0
          : !!accountId);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.screenEdge.standard, paddingBottom: theme.spacing.xxl }}
        >
          <Stack gap="lg">
            <ScreenHeader
              inline
              title={isPayable ? 'Ödeme yap' : 'Tahsilat al'}
              leftLabel={{ label: 'Vazgeç', onPress: () => router.back() }}
            />

            {/* Tuval OdemeKaydet: bağlam satırı, ortada büyük tutar, Tamamı / Kısmi tutar. */}
            <Stack gap="sm" align="center">
              {counterpartyName ? (
                <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ fontSize: 13 }}>
                  {[counterpartyName, selectedRecords.length === 1 ? selectedRecords[0].title : null].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {method === 'ciro' ? (
                <Text variant="displayAmount" tabular style={{ fontSize: 40, lineHeight: 46 }}>
                  {sourceTotalMinor > 0 ? formatMinorAmount(sourceTotalMinor, currencyCode) : 'Çek/senet seçin'}
                </Text>
              ) : (
                <View style={{ alignSelf: 'stretch' }}>
                  <BigAmountInput
                    value={displayAmount}
                    onChangeText={(value) => {
                      setAmount(value);
                      setAmountTouched(true);
                    }}
                    precision={precision}
                    symbol={currencyCode === 'TRY' ? '₺' : currencyCode === 'USD' ? '$' : currencyCode === 'EUR' ? '€' : undefined}
                  />
                </View>
              )}
              {method !== 'ciro' && suggestedMinor > 0 ? (
                <Row gap="xs" style={{ justifyContent: 'center' }}>
                  <Pill label="Tamamı" selected={!amountTouched} onPress={() => setAmountTouched(false)} />
                  <Pill
                    label="Kısmi tutar"
                    selected={amountTouched}
                    onPress={() => {
                      if (!amountTouched) setAmount(displayAmount);
                      setAmountTouched(true);
                    }}
                  />
                </Row>
              ) : null}
            </Stack>

            <Stack gap="sm">
              <Text variant="label" color="textSecondary">
                KİŞİ / FİRMA
              </Text>
              {activeWorkspaceId ? (
                <CounterpartyPicker
                  workspaceId={activeWorkspaceId}
                  counterparties={counterpartiesQuery.data ?? []}
                  selectedId={counterpartyId}
                  onSelect={(value) => {
                    setCounterpartyId(value);
                    setSelectedIds(null);
                    setSourceIds(null);
                    setAmountTouched(false);
                    // Mahsup kaynakları cariye bağlıdır; yeni caride olmayabilir.
                    if (method === 'mahsup') setMethod('havale');
                  }}
                  onCreated={() => {
                    queryClient.invalidateQueries({ queryKey: queryKeys.counterparties(activeWorkspaceId) });
                  }}
                />
              ) : null}
            </Stack>

            {counterpartyId ? (
              <Stack gap="sm">
                <Text variant="label" color="textSecondary">
                  {isPayable ? 'KAPATILACAK BORÇLAR' : 'KAPATILACAK ALACAKLAR'}
                </Text>
                {openRecords.length === 0 ? (
                  <Text variant="body" color="textSecondary">
                    {openQuery.isPending
                      ? 'Açık kayıtlar yükleniyor…'
                      : `Bu kişiyle açık bir ${isPayable ? 'borç' : 'alacak'} yok. Tutar ${isPayable ? 'ön ödeme' : 'avans'} olarak kaydedilir.`}
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {openRecords.map((record) => {
                      const selected = effectiveSelectedIds.includes(record.id);
                      const applied = allocation?.allocations.find((a) => a.obligation.id === record.id)?.amountMinor ?? 0;
                      return (
                        <RecordOption
                          key={record.id}
                          record={record}
                          selected={selected}
                          appliedMinor={selected ? applied : 0}
                          onToggle={() => toggleRecord(record.id)}
                        />
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            ) : null}

            <Stack gap="sm">
              <Text variant="label" color="textSecondary">
                {isPayable ? 'ÖDEME YÖNTEMİ' : 'TAHSİLAT YÖNTEMİ'}
              </Text>
              <SegmentedControl<SettlementMethod>
                options={availableMethods}
                value={method}
                onChange={(value) => {
                  setMethod(value);
                  setAccountId(null);
                  setSourceIds(null);
                  setAmountTouched(false);
                  setSelectedIds(preselectedObligationId ? [preselectedObligationId] : null);
                }}
                scrollable
              />
              {method === 'mahsup' ? (
                <Text variant="caption" color="textSecondary">
                  Bu cariyle ters yöndeki kayıtlar (ör. önceden yapılmış ön ödeme/avans) karşılıklı kapatılır; para hareketi oluşmaz.
                </Text>
              ) : method === 'ciro' ? (
                <Text variant="caption" color="textSecondary">
                  Müşteriden aldığın çek/senedi bu cariye verirsin: çek portföyden çıkar, seçilen borçlar kapanır; hesaptan para çıkmaz.
                </Text>
              ) : null}
            </Stack>

            {method === 'mahsup' || method === 'ciro' ? (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  {method === 'ciro' ? 'CİRO EDİLECEK ÇEK / SENETLER' : isPayable ? 'MAHSUP EDİLECEK ALACAKLAR' : 'MAHSUP EDİLECEK BORÇLAR'}
                </Text>
                <Stack gap="xs">
                  {sourceList.map((record) => (
                    <RecordOption
                      key={record.id}
                      record={record}
                      selected={effectiveSourceIds.includes(record.id)}
                      appliedMinor={0}
                      showCounterparty={method === 'ciro'}
                      onToggle={() => toggleSource(record.id)}
                    />
                  ))}
                </Stack>
              </Stack>
            ) : null}

            {allocation && selectedRecords.length > 0 ? (
              <Text variant="caption" color="textSecondary">
                {allocation.allocations.length === 0
                  ? ''
                  : allocation.allocations.every((a) => a.amountMinor >= a.obligation.remaining_amount_minor)
                    ? `${allocation.allocations.length} kayıt tamamen kapanır.`
                    : 'Son kayıt kısmen kapanır, kalan tutarı açık kalır.'}
                {allocation.leftoverMinor > 0 && method !== 'mahsup'
                  ? ` Artan ${formatMinorAmount(allocation.leftoverMinor, currencyCode)} cariye ${isPayable ? 'ön ödeme (alacak)' : 'alınan avans (borç)'} olarak yazılır ve cari bakiyesine girer.`
                  : ''}
              </Text>
            ) : null}

            {method === 'mahsup' || method === 'ciro' ? null : instrument ? (
              <Card>
                <Stack gap="md">
                  <Stack gap="xxs">
                    <Text variant="cardTitle">{instrumentLabel} bilgileri</Text>
                    <Text variant="caption" color="textSecondary">
                      {isPayable
                        ? `Seçilen borçlar bu tutar kadar kapanır, vadeli bir ${instrumentLabel.toLocaleLowerCase('tr-TR')} borcu açılır. Para vadede ödediğinizde hesaptan çıkar.`
                        : `Seçilen alacaklar bu tutar kadar kapanır, vadeli bir ${instrumentLabel.toLocaleLowerCase('tr-TR')} alacağı açılır. Para vadede tahsil ettiğinizde hesaba girer.`}
                    </Text>
                  </Stack>

                  <TextField
                    label={`${instrumentLabel.toLocaleUpperCase('tr-TR')} NO (İSTEĞE BAĞLI)`}
                    placeholder="Örn. 1234567"
                    value={instrumentNo}
                    onChangeText={setInstrumentNo}
                  />

                  {method === 'cek' ? (
                    <Stack gap="sm">
                      <Text variant="label" color="textSecondary">
                        BANKA (İSTEĞE BAĞLI)
                      </Text>
                      <BankPicker selectedId={bankCode} onSelect={setBankCode} />
                    </Stack>
                  ) : (
                    <Stack gap="sm">
                      <Text variant="label" color="textSecondary">
                        VADE SAYISI
                      </Text>
                      <Row gap="sm" align="center">
                        <StepButton icon="remove" disabled={dueCount <= 1} onPress={() => setDueCount((c) => Math.max(1, c - 1))} />
                        <Text variant="cardTitle" tabular style={{ minWidth: 32, textAlign: 'center' }}>
                          {dueCount}
                        </Text>
                        <StepButton icon="add" disabled={dueCount >= 24} onPress={() => setDueCount((c) => Math.min(24, c + 1))} />
                        <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                          {dueCount > 1 ? 'Aylık eşit vadeler' : 'Tek vade'}
                        </Text>
                      </Row>
                    </Stack>
                  )}

                  <DateField
                    label={effectiveDueCount > 1 ? 'İLK VADE TARİHİ' : 'VADE TARİHİ'}
                    value={firstDueDate}
                    onChangeText={setFirstDueDate}
                  />

                  {effectiveDueCount > 1 && dueRows.length > 0 ? (
                    <Stack gap="xxs">
                      {dueRows.map((row, index) => (
                        <Row key={index} style={{ justifyContent: 'space-between' }}>
                          <Text variant="caption" color="textSecondary">
                            {index + 1}. vade · {shortDateFormatter.format(new Date(row.dueDate))}
                          </Text>
                          <Text variant="caption" tabular>
                            {formatMinorAmount(row.amountMinor, currencyCode)}
                          </Text>
                        </Row>
                      ))}
                    </Stack>
                  ) : null}

                  {instrumentAccounts.length > 0 ? (
                    <Stack gap="sm">
                      <Text variant="label" color="textSecondary">
                        {isPayable ? 'VADEDE ÖDENECEK HESAP (İSTEĞE BAĞLI)' : 'VADEDE TAHSİL EDİLECEK HESAP (İSTEĞE BAĞLI)'}
                      </Text>
                      <AccountPicker
                        accounts={instrumentAccounts}
                        selectedId={instrumentAccountId}
                        onSelect={setInstrumentAccountId}
                        placeholder="Hesap seçin"
                      />
                    </Stack>
                  ) : null}
                </Stack>
              </Card>
            ) : (
              <FieldGroup>
                {methodAccounts.length === 0 ? (
                  <FormRow
                    label={isPayable ? 'Ödemenin çıktığı hesap' : 'Tahsilatın girdiği hesap'}
                    value={
                      method === 'kredi_karti'
                        ? isPayable
                          ? "Kayıtlı kredi kartı yok. Hesaplar'dan kart ekleyin."
                          : 'Kart tahsilatı için POS veya banka hesabı ekleyin.'
                        : "Önce Hesaplar'dan bir hesap ekleyin."
                    }
                  />
                ) : (
                  <AccountPicker
                    accounts={methodAccounts}
                    selectedId={accountId}
                    onSelect={setAccountId}
                    title="Hesap seç"
                    renderTrigger={(selected, open) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={selected ? `Hesap: ${selected.name}` : 'Hesap seçin'}
                        onPress={open}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: theme.spacing.md, paddingVertical: 10, minHeight: 60 }}
                      >
                        {selected ? (
                          <AccountAvatar account={selected} />
                        ) : (
                          <Ionicons name="wallet-outline" size={20} color={theme.colors.textSecondary} />
                        )}
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Text numberOfLines={1} style={{ fontWeight: '500', color: selected ? theme.colors.textPrimary : theme.colors.mutedControl }}>
                            {selected ? selected.name : isPayable ? 'Ödemenin çıktığı hesap' : 'Tahsilatın girdiği hesap'}
                          </Text>
                          {selected && balanceByAccount.has(selected.id) ? (
                            <Text variant="caption" color="textSecondary" tabular numberOfLines={1}>
                              Bakiye {formatMinorAmount(balanceByAccount.get(selected.id)!.balanceMinor, balanceByAccount.get(selected.id)!.currencyCode)}
                            </Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
                      </Pressable>
                    )}
                  />
                )}
                <DateField label="İşlem tarihi" value={dateStr} onChangeText={setDateStr} />
                {!cashless ? (
                  <TextField
                    label="Açıklama (isteğe bağlı)"
                    placeholder={isPayable ? 'Örn. Mart faturası ödemesi' : 'Örn. Mart tahsilatı'}
                    value={description}
                    onChangeText={setDescription}
                  />
                ) : null}
              </FieldGroup>
            )}

            {instrument || method === 'mahsup' || method === 'ciro' ? (
              <FieldGroup>
                <DateField label="İşlem tarihi" value={dateStr} onChangeText={setDateStr} />
              </FieldGroup>
            ) : null}

            {!cashless ? (
              <ReceiptAttachField value={receipt} onChange={setReceipt} allowed={archive.allowed} onUpgrade={() => router.push('/paywall')} />
            ) : null}

            <Button
              label={isPayable ? 'Ödemeyi kaydet' : 'Tahsilatı kaydet'}
              onPress={() => saveMutation.mutate()}
              disabled={!canSubmit || saveMutation.isPending}
              loading={saveMutation.isPending}
            />

          </Stack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RecordOption({
  record,
  selected,
  appliedMinor,
  showCounterparty = false,
  onToggle,
}: {
  record: ObligationWithRelations;
  selected: boolean;
  appliedMinor: number;
  /** Ciro listesinde çekin hangi müşteriden alındığı gösterilir. */
  showCounterparty?: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const closes = appliedMinor > 0 && appliedMinor >= record.remaining_amount_minor;
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onToggle}>
      <Card
        elevated={selected}
        style={{ borderWidth: 1.5, borderColor: selected ? theme.colors.textPrimary : theme.colors.border }}
      >
        <Row gap="sm" align="center">
          <Ionicons
            name={selected ? 'checkbox' : 'square-outline'}
            size={22}
            color={selected ? theme.colors.textPrimary : theme.colors.mutedControl}
          />
          <ObligationIcon
            documentType={record.document_type}
            bankCode={record.bank_code}
            serviceCode={record.service_code}
            fallbackName={record.title}
            size={32}
          />
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle" numberOfLines={1}>
              {record.title}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {showCounterparty && record.counterparty?.name ? `${record.counterparty.name} · ` : ''}
              {DOCUMENT_TYPE_LABEL[record.document_type] ?? 'Kayıt'}
              {record.due_date ? ` · ${shortDateFormatter.format(new Date(record.due_date))}` : ''}
            </Text>
          </Stack>
          <Stack gap="xxs" align="flex-end">
            <Text variant="cardTitle" tabular>
              {formatMinorAmount(record.remaining_amount_minor, record.currency_code)}
            </Text>
            <Text variant="caption" color={appliedMinor > 0 ? undefined : 'textSecondary'} style={appliedMinor > 0 ? { color: theme.colors.success } : undefined}>
              {appliedMinor > 0
                ? closes
                  ? 'Kapanır'
                  : `${formatMinorAmount(appliedMinor, record.currency_code)} düşer`
                : 'kalan'}
            </Text>
          </Stack>
        </Row>
      </Card>
    </Pressable>
  );
}

function StepButton({
  icon,
  disabled,
  onPress,
}: {
  icon: 'add' | 'remove';
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} hitSlop={8}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.surfacePrimary,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <Ionicons name={icon} size={18} color={theme.colors.textPrimary} />
      </View>
    </Pressable>
  );
}
