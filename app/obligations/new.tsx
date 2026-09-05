import { useEffect, useState } from 'react';
import { Alert, InteractionManager, KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { AmountField, Button, Card, DateField, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { CategoryPicker } from '@/components/finance/CategoryPicker';
import { AccountPicker } from '@/components/finance/AccountPicker';
import { CounterpartyPicker } from '@/components/finance/CounterpartyPicker';
import { DocumentTypePicker } from '@/components/finance/DocumentTypePicker';
import { BankPicker } from '@/components/finance/BankPicker';
import { ServicePicker } from '@/components/finance/ServicePicker';
import { ValueUnitPicker } from '@/components/finance/ValueUnitPicker';
import {
  BANK_DOCUMENT_TYPES,
  INTEREST_DOCUMENT_TYPES,
  getDefaultAmountMode,
  getInstallmentUnitLabels,
  type ObligationAmountMode,
} from '@/features/obligations/documentTypes';
import { listAccounts } from '@/features/accounts/api';
import { listCategories } from '@/features/categories/api';
import { listCounterparties } from '@/features/counterparties/api';
import { listMyWorkspaces } from '@/features/workspaces/api';
import { getValueUnit, VALUE_UNIT_LABEL } from '@/features/valueUnits/units';
import {
  createObligation,
  createInstallmentPlan,
  deleteObligation,
  getObligationWithInstallments,
  updateObligation,
  updateInstallmentPlan,
  type Installment,
  type Obligation,
  type UpdateInstallmentPlanRow,
} from '@/features/obligations/api';
import { createTransaction } from '@/features/transactions/api';
import { recordPastInstallmentPayments } from '@/features/payments/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatAmountInput, parseValueUnitAmountToMinor, formatMinorAmount, formatValueUnitAmount } from '@/utils/money';
import {
  buildAmortizedInstallments,
  buildFixedInstallments,
  addMonthsToIsoDate,
  recomputeInstallmentAfterAmountEdit,
  type InstallmentPlanItem,
} from '@/utils/installmentPlan';
import { queryKeys } from '@/services/queryKeys';
import { syncObligationReminder } from '@/services/notifications';
import { showSuccessAlert } from '@/utils/alerts';

type Direction = 'payable' | 'receivable';

const DIRECTIONS: Array<{ value: Direction; label: string }> = [
  { value: 'payable', label: 'Borç' },
  { value: 'receivable', label: 'Alacak' },
];

// Düzenlemede mevcut bir taksit planının satırı — `id`/`original` doluysa DB'deki gerçek
// taksite karşılık gelir, `locked` (tamamen ödenmiş) satırların tarih/tutarı değiştirilemez
// ve asla silinemez (bkz. InstallmentPlanEditor, getPlanValidationError).
interface PlanRow {
  id: string | null;
  installmentNumber: number;
  dueDate: string;
  amountStr: string;
  locked: boolean;
  /** Kaydetmede bu vade geçmiş tarihiyle "ödendi" işaretlenecek (bkz. toplu ödendi akışı).
   * Zaten tamamen ödenmiş satırlarda (locked) anlamsızdır ve gösterilmez. */
  markPaid: boolean;
  original: Installment | null;
}

const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

export default function NewObligationScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const { id, type, accountId, dueDate, counterpartyId, direction } = useLocalSearchParams<{
    id?: string;
    type?: string;
    accountId?: string;
    dueDate?: string;
    counterpartyId?: string;
    direction?: string;
  }>();
  const isEditing = !!id;

  const existingQuery = useQuery({
    queryKey: ['obligation', id, 'edit'],
    queryFn: () => getObligationWithInstallments(id as string),
    enabled: isEditing,
  });

  if (isEditing && !existingQuery.data) {
    return (
      <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          {existingQuery.error ? (
            <Text variant="body" color="danger">
              {existingQuery.error instanceof Error ? existingQuery.error.message : 'Kayıt yüklenemedi'}
            </Text>
          ) : null}
        </Stack>
      </SafeAreaView>
    );
  }

  return (
    <ObligationForm
      key={reflowKey}
      id={isEditing ? (id as string) : null}
      initial={existingQuery.data?.obligation ?? null}
      installments={existingQuery.data?.installments ?? []}
      hasInstallments={(existingQuery.data?.installments.length ?? 0) > 0}
      initialDocumentType={typeof type === 'string' ? type : undefined}
      initialAccountId={typeof accountId === 'string' ? accountId : undefined}
      initialDueDate={typeof dueDate === 'string' ? dueDate : undefined}
      initialCounterpartyId={typeof counterpartyId === 'string' ? counterpartyId : undefined}
      initialDirection={direction === 'payable' || direction === 'receivable' ? direction : undefined}
    />
  );
}

interface ObligationFormProps {
  id: string | null;
  initial: Obligation | null;
  /** Düzenleme modunda mevcut taksit planı — taksit tarihi/tutarı/sayısı düzenlemesi
   * (BAŞLANGIÇ TARİHİ + TAKSİT PLANI bölümü) bu listeden başlatılır. */
  installments: Installment[];
  hasInstallments: boolean;
  initialDocumentType?: string;
  /** Hesap detayından "Ekstre Ekle" gibi kısayollarla gelindiğinde hesabı önceden doldurur. */
  initialAccountId?: string;
  /** Ekstre tablosunda belirli bir geçmiş ayın "Yüklenmedi" satırından gelindiğinde o ayın
   * beklenen son ödeme tarihini önceden doldurur (bkz. app/accounts/[id].tsx) — kullanıcı
   * her zaman elle değiştirebilir. */
  initialDueDate?: string;
  /** Cari detayından "Satış/Alış Faturası Oluştur" veya "Tahsilat/Ödeme Ekle → Çek/Senet"
   * kısayollarıyla gelindiğinde kişi/firmayı önceden doldurur (bkz. app/counterparties/[id].tsx). */
  initialCounterpartyId?: string;
  /** Aynı kısayollarda borç/alacak yönünü önceden doldurur. */
  initialDirection?: Direction;
}

function ObligationForm({
  id,
  initial,
  installments,
  hasInstallments,
  initialDocumentType,
  initialAccountId,
  initialDueDate,
  initialCounterpartyId,
  initialDirection,
}: ObligationFormProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const isEditing = !!id;

  const [direction, setDirection] = useState<Direction>(
    (initial?.direction as Direction) ?? initialDirection ?? 'payable'
  );
  const [documentType, setDocumentType] = useState<string | null>(
    initial?.document_type ?? initialDocumentType ?? null
  );
  const [bankCode, setBankCode] = useState<string | null>(initial?.bank_code ?? null);
  const [serviceCode, setServiceCode] = useState<string | null>(initial?.service_code ?? null);
  const [title, setTitle] = useState(initial?.title ?? '');
  // docs/01-finansal-kayit-modeli.md §3.5 — birim, kayıt oluşturulduktan sonra
  // değiştirilemez; edit modda initial.currency_code sabit kalır (aşağıda salt-okunur
  // gösterilir). Yeni kayıtta workspace'in varsayılan birimi hazır olana kadar 'TRY' ile
  // başlar, aşağıdaki efekt bir kez gerçek varsayımla günceller.
  const [valueUnitCode, setValueUnitCode] = useState(initial?.currency_code ?? 'TRY');
  const [valueUnitDefaulted, setValueUnitDefaulted] = useState(!!initial);
  const [totalAmount, setTotalAmount] = useState(() => {
    if (!initial) return '';
    const precision = getValueUnit(initial.currency_code).precision;
    return formatAmountInput(
      (initial.total_amount_minor / 10 ** precision).toFixed(precision).replace('.', ','),
      precision
    );
  });
  const [dueDate, setDueDate] = useState(
    initial?.due_date ?? initialDueDate ?? new Date().toISOString().slice(0, 10)
  );
  const [counterpartyId, setCounterpartyId] = useState<string | null>(
    initial?.counterparty_id ?? initialCounterpartyId ?? null
  );
  const [accountId, setAccountId] = useState<string | null>(initial?.account_id ?? initialAccountId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(initial?.category_id ?? null);
  const [installmentCountStr, setInstallmentCountStr] = useState('1');
  const [interestRateStr, setInterestRateStr] = useState('');
  // TUTAR alanının anlamı: 'total' → girilen tutar toplam borçtur ve vadelere bölünür
  // (kredi, çek, senet…); 'per_installment' → girilen tutar HER VADENİN tutarıdır ve
  // toplam, tutar × vade sayısıdır (maaş, kira, abonelik, vergi/SGK…). Varsayılan belge
  // türünden gelir (getDefaultAmountMode) ama kullanıcı elle değiştirebilir; elle
  // değiştirdikten sonra tür değişse bile seçimi korunur (amountModeTouched).
  const [amountMode, setAmountMode] = useState<ObligationAmountMode>(() =>
    getDefaultAmountMode(initial?.document_type ?? initialDocumentType ?? null)
  );
  const [amountModeTouched, setAmountModeTouched] = useState(false);
  // Toplu "ödendi" işaretleme: uygulamayı ortada bir tarihte kurup geçmişe dönük plan giren
  // kullanıcı (ör. Ocak'ta başlayan 12 aylık maaşı Eylül'de girmek) her vadeyi tek tek
  // "Öde" ile işaretlemek zorunda kalmasın. Vadesi geçmiş satırlar varsayılan olarak ödendi
  // gelir; kullanıcı tek tek geri alabilir. Aynı davranış OCR onay ekranında zaten vardı
  // (bkz. app/documents/[id]/review.tsx) — elle giriş yolunda eksikti.
  const [paidOverrides, setPaidOverrides] = useState<Record<number, boolean>>({});
  const [depositAccountId, setDepositAccountId] = useState<string | null>(null);

  const categoryKind = direction === 'payable' ? 'expense' : 'income';

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  // Nakit avans yalnızca bir kredi kartından çekilir; çekilen nakit ise kart dışında
  // herhangi bir hesaba (kasa/banka/cüzdan/POS) yatırılabilir.
  const creditCardAccounts = (accountsQuery.data ?? []).filter((a) => a.type === 'credit_card');
  const depositTargetAccounts = (accountsQuery.data ?? []).filter((a) => a.type !== 'credit_card');
  // POS yalnızca tahsilat alır, ondan ödeme yapılamaz — borç (payable) kaydında HESAP
  // seçeneklerinden çıkarılır; alacak (receivable) tahsilatı POS'tan olabileceği için
  // orada kalır.
  const generalAccounts =
    direction === 'payable'
      ? (accountsQuery.data ?? []).filter((a) => a.type !== 'pos')
      : accountsQuery.data ?? [];

  const categoriesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.categories(activeWorkspaceId, categoryKind) : ['categories', 'disabled'],
    queryFn: () => listCategories(activeWorkspaceId as string, categoryKind),
    enabled: !!activeWorkspaceId,
  });

  const counterpartiesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.counterparties(activeWorkspaceId) : ['counterparties', 'disabled'],
    queryFn: () => listCounterparties(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  // docs/05-veri-modeli.md §9.4.3 — yeni kayıtta önerilen varsayılan değer birimi
  // workspace'in default_value_unit_code'udur; workspace listesi zaten uygulama genelinde
  // (workspace switcher) çekildiği için burada aynı queryKey ile cache'ten gelir, ekstra
  // ağ isteği yaratmaz.
  const workspacesQuery = useQuery({ queryKey: queryKeys.workspaces(), queryFn: listMyWorkspaces });

  useEffect(() => {
    if (valueUnitDefaulted) return;
    const activeWorkspace = workspacesQuery.data?.find((w) => w.id === activeWorkspaceId);
    if (!activeWorkspace) return;
    setValueUnitCode(activeWorkspace.default_value_unit_code);
    setValueUnitDefaulted(true);
  }, [valueUnitDefaulted, workspacesQuery.data, activeWorkspaceId]);

  const valueUnit = getValueUnit(valueUnitCode);
  const isFiatUnit = valueUnit.unitType === 'fiat';

  // Kredi kayıtlarında borçlu taraf kişi/firma değil bankadır — KİŞİ/FİRMA alanı yerine
  // zorunlu BANKA seçimi gösterilir, karta banka logosuyla temsil edilir. Abonelik
  // kayıtlarında da borçlu taraf kişi/firma değil servistir (Netflix, YouTube vb.) —
  // aynı gerekçeyle KİŞİ/FİRMA yerine isteğe bağlı SERVİS seçimi gösterilir.
  const isLoanType = documentType === 'kredi';
  const isSubscriptionType = documentType === 'abonelik';
  // Nakit avans: borçlu taraf kart hesabıdır (kişi/firma alanı anlamsız, kredi/abonelik ile
  // aynı gerekçe — bkz. COUNTERPARTY_LESS_DOCUMENT_TYPES), HESAP zorunludur ve yalnızca kredi
  // kartı hesapları arasından seçilir; ayrıca çekilen nakit gerçekten bir hesaba yatırılabilir.
  const isCashAdvanceType = documentType === 'nakit_avans';
  // Kredi kartı ekstresi: borçlu taraf da kart hesabıdır (aynı gerekçe) — HESAP zorunlu ve
  // yalnızca kredi kartı hesapları listelenir. Hesapsız/sahipsiz bir ekstre oluşursa kart
  // detayındaki Ekstreler sekmesinde ve kart ödemesi akışında hiç görünmez (bkz.
  // app/accounts/[id].tsx statementsQuery, features/payments/api.ts recordCardPayment).
  const isCardStatementType = documentType === 'kredi_karti_ekstresi';
  // Personel maaşı: karşı taraf müşteri/tedarikçi değil personeldir — cari seçici bu bağlamda
  // "PERSONEL" olarak etiketlenir ve yeni kayıt doğrudan 'personel' türüyle oluşturulur.
  const isSalaryType = documentType === 'maas';
  const periodLabels = getInstallmentUnitLabels(documentType);
  const unitLabel = periodLabels.unitTitle;

  // Mevcut bir taksit planı olan kaydı düzenlerken TUTAR/VADE/TAKSİT SAYISI alanları
  // yerine aşağıdaki taksit planı editörü (BAŞLANGIÇ TARİHİ + numaralı taksit satırları)
  // gösterilir — tek bir toplam tutar yerine her taksitin kendi tarihi/tutarı düzenlenir.
  const [planRows, setPlanRows] = useState<PlanRow[]>(() =>
    installments.map((inst) => ({
      id: inst.id,
      installmentNumber: inst.installment_number,
      dueDate: inst.due_date,
      amountStr: formatAmountInput(
        (inst.amount_minor / 10 ** valueUnit.precision).toFixed(valueUnit.precision).replace('.', ','),
        valueUnit.precision
      ),
      locked: inst.remaining_amount_minor <= 0,
      markPaid: false,
      original: inst,
    }))
  );
  const isPlanEditing = isEditing && hasInstallments;
  // Tamamen ödenmiş taksitler asla silinemez; kuyruk yalnızca en son ödenmiş taksitin
  // numarasına kadar kısaltılabilir (taksitler numaralandırmada boşluksuz kalmalı).
  const minPlanCount = Math.max(
    1,
    installments.reduce(
      (max, inst) => (inst.remaining_amount_minor <= 0 ? Math.max(max, inst.installment_number) : max),
      0
    )
  );

  function updatePlanRowDate(index: number, value: string) {
    setPlanRows((rows) => rows.map((r, i) => (i === index ? { ...r, dueDate: value } : r)));
  }

  function updatePlanRowAmount(index: number, value: string) {
    setPlanRows((rows) => rows.map((r, i) => (i === index ? { ...r, amountStr: value } : r)));
  }

  // Başlangıç tarihi değişince yalnızca henüz ödenmemiş taksitler aynı aylık kadansla
  // yeniden dizilir — ödenmiş taksitlerin tarihi geçmişi yansıttığı için sabit kalır.
  function updatePlanStartDate(value: string) {
    setPlanRows((rows) =>
      rows.map((r) => (r.locked ? r : { ...r, dueDate: addMonthsToIsoDate(value, r.installmentNumber - 1) }))
    );
  }

  function addPlanRow() {
    setPlanRows((rows) => {
      const last = rows[rows.length - 1];
      return [
        ...rows,
        {
          id: null,
          installmentNumber: (last?.installmentNumber ?? 0) + 1,
          dueDate: last ? addMonthsToIsoDate(last.dueDate, 1) : new Date().toISOString().slice(0, 10),
          amountStr: last?.amountStr ?? '',
          locked: false,
          markPaid: false,
          original: null,
        },
      ];
    });
  }

  // "Planı uzat": mevcut planın sonuna bir kerede N vade ekler. Maaş zammı/kira artışı
  // gibi durumlarda yeni tutar verilebilir; boş bırakılırsa son vadenin tutarı sürer.
  // Tek tek "Taksit Ekle"ye basmanın yerini alır (12 aylık uzatma 12 dokunuş demekti).
  function extendPlan(count: number, amountStr: string | null) {
    if (count <= 0) return;
    setPlanRows((rows) => {
      const next = [...rows];
      for (let i = 0; i < count; i += 1) {
        const last = next[next.length - 1];
        next.push({
          id: null,
          installmentNumber: (last?.installmentNumber ?? 0) + 1,
          dueDate: last ? addMonthsToIsoDate(last.dueDate, 1) : new Date().toISOString().slice(0, 10),
          amountStr: amountStr?.trim() ? amountStr : (last?.amountStr ?? ''),
          locked: false,
          markPaid: false,
          original: null,
        });
      }
      return next;
    });
  }

  function togglePlanRowPaid(index: number, value: boolean) {
    setPlanRows((rows) => rows.map((r, i) => (i === index ? { ...r, markPaid: value } : r)));
  }

  // Yalnızca kuyruktaki (en sondaki) taksit kaldırılabilir — numaralandırma böylece
  // her zaman 1..N aralığında boşluksuz kalır.
  function removeLastPlanRow() {
    setPlanRows((rows) => rows.slice(0, -1));
  }

  function getPlanValidationError(rows: PlanRow[]): string | null {
    if (rows.length === 0) return 'En az bir taksit olmalı.';
    let previous: number | null = null;
    for (const row of rows) {
      const amountMinor = parseValueUnitAmountToMinor(row.amountStr, valueUnitCode);
      if (amountMinor === null || amountMinor <= 0) return `${row.installmentNumber}. taksit tutarı okunamadı.`;
      const parsedDate = new Date(row.dueDate);
      if (Number.isNaN(parsedDate.getTime())) return `${row.installmentNumber}. taksit tarihi okunamadı.`;
      if (previous !== null && parsedDate.getTime() < previous) return 'Taksit tarihleri sıralı olmalı.';
      previous = parsedDate.getTime();
      if (row.original) {
        const paidMinor = Math.max(0, row.original.amount_minor - row.original.remaining_amount_minor);
        if (amountMinor < paidMinor) {
          return `${row.installmentNumber}. taksit için ödenen tutardan düşük tutar girilemez.`;
        }
      }
    }
    return null;
  }

  const planError = isPlanEditing ? getPlanValidationError(planRows) : null;
  const planTotalMinor = isPlanEditing
    ? planRows.reduce((sum, r) => sum + (parseValueUnitAmountToMinor(r.amountStr, valueUnitCode) ?? 0), 0)
    : 0;

  // docs/01-finansal-kayit-modeli.md §3.5 — kıymetli maden/döviz kaydı P1 MVP kapsamında
  // yalnızca tek seferlik borç/alacak olarak tutulur; taksitlendirme (buildAmortizedInstallments,
  // bkz. utils/installmentPlan.ts) tam sayı kuruş varsayımıyla çalışıyor ve adet/gram bazlı
  // kesirli birimler için genelleştirilmemiş. Taksit sayısı fiat dışında 1'e sabitlenir.
  const installmentCount = isFiatUnit ? Math.max(1, Math.min(60, parseInt(installmentCountStr, 10) || 1)) : 1;
  const enteredAmountMinor = parseValueUnitAmountToMinor(totalAmount, valueUnitCode) ?? 0;
  // "Her vade tutarı" modu yalnızca birden fazla vade varken anlamlıdır; tek vadede iki mod da
  // aynı sonucu verir ve seçim gizlenir (bkz. showAmountModeSelector).
  const isPerInstallmentMode = amountMode === 'per_installment' && installmentCount > 1;
  const showAmountModeSelector = !isEditing && isFiatUnit && installmentCount > 1;
  // Maaş/kira/abonelik gibi tekrarlayan kayıtlarda TUTAR alanı her vadenin tutarıdır; toplam,
  // tutar × vade sayısıdır. Kredi/çek/senet gibi türlerde TUTAR zaten toplam borcun kendisidir
  // (nakit avansta çekilen anapara) — vadeliyse ödenecek toplam faizle birlikte aşağıdaki
  // installments'tan türer, TUTAR alanının kendisi değişmez (bkz. obligationTotalMinor).
  const totalAmountMinor = isPerInstallmentMode
    ? enteredAmountMinor * installmentCount
    : enteredAmountMinor;
  // Faiz oranı kredi VE nakit avansta, birden fazla taksitte istenir — TUTAR alanı bu
  // durumda anaparayı (nakit avansta çekilen tutarı) temsil eder, taksitler azalan bakiye
  // üzerinden hesaplanır ve obligation'ın toplamı anapara+toplam faiz olur (banka kredisi/nakit
  // avans faizi gibi). Tek taksitte (peşin) faiz uygulanmaz, TUTAR = toplam borç kalır.
  // "Her vade tutarı" modunda girilen tutar zaten ödenecek nihai tutardır — üzerine amortisman
  // uygulanmaz, bu yüzden faiz alanı da gösterilmez.
  const showInterestField =
    !isEditing &&
    isFiatUnit &&
    !!documentType &&
    INTEREST_DOCUMENT_TYPES.has(documentType) &&
    !isPerInstallmentMode &&
    installmentCount > 1;
  const interestRatePercent =
    showInterestField && interestRateStr ? Number(interestRateStr.replace(',', '.')) || 0 : 0;

  // Tek yer: hem önizleme hem kayıt aynı planı üretsin (aksi halde önizlemede görünenle
  // kaydedilen taksitler ayrışabilir). "Her vade" modunda tutar bölünmez, her satır birebir
  // aynıdır — yuvarlama artığı hiç oluşmaz (bkz. utils/installmentPlan.ts buildFixedInstallments).
  function buildPlan(): InstallmentPlanItem[] {
    if (installmentCount <= 1 || enteredAmountMinor <= 0) return [];
    return isPerInstallmentMode
      ? buildFixedInstallments(enteredAmountMinor, installmentCount, dueDate)
      : buildAmortizedInstallments(totalAmountMinor, installmentCount, dueDate, interestRatePercent);
  }

  const installmentPreview = isEditing ? [] : buildPlan();

  const todayIso = new Date().toISOString().slice(0, 10);
  function isPreviewPaid(item: InstallmentPlanItem): boolean {
    return paidOverrides[item.installmentNumber] ?? item.dueDate < todayIso;
  }
  function togglePreviewPaid(installmentNumber: number, value: boolean) {
    setPaidOverrides((prev) => ({ ...prev, [installmentNumber]: value }));
  }
  const paidPreviewCount = installmentPreview.filter(isPreviewPaid).length;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !title.trim() || !documentType) {
        throw new Error('Eksik alan var');
      }
      if (isPlanEditing ? planTotalMinor <= 0 : !totalAmountMinor) {
        throw new Error('Eksik alan var');
      }

      const bankCodeForType = BANK_DOCUMENT_TYPES.has(documentType) ? bankCode : null;
      const serviceCodeForType = isSubscriptionType ? serviceCode : null;
      const counterpartyIdForType =
        isLoanType || isSubscriptionType || isCashAdvanceType || isCardStatementType ? null : counterpartyId;

      if (isEditing) {
        if (isPlanEditing) {
          const validationError = getPlanValidationError(planRows);
          if (validationError) throw new Error(validationError);

          // Yalnızca gerçekten değişen (veya yeni eklenen) satırlar yazılır — değişmeyen
          // taksitlerin principal/interest kırılımı (bkz. detay ekranı "Anapara/Faiz")
          // korunur. Tutarı değişen bir taksitin kırılımı artık geçerli olmadığı için null'a çekilir.
          const preparedRows: UpdateInstallmentPlanRow[] = [];
          for (const row of planRows) {
            const amountMinor = parseValueUnitAmountToMinor(row.amountStr, valueUnitCode) as number;
            const amountChanged = !row.original || row.original.amount_minor !== amountMinor;
            const dateChanged = !row.original || row.original.due_date !== row.dueDate;
            if (row.original && !amountChanged && !dateChanged) continue;

            const recompute = row.original
              ? recomputeInstallmentAfterAmountEdit(
                  {
                    amountMinor: row.original.amount_minor,
                    remainingAmountMinor: row.original.remaining_amount_minor,
                    status: row.original.status,
                  },
                  amountMinor,
                  direction
                )
              : { amountMinor, remainingAmountMinor: amountMinor, status: 'bekliyor' };

            preparedRows.push({
              id: row.id,
              installmentNumber: row.installmentNumber,
              dueDate: row.dueDate,
              amountMinor: recompute.amountMinor,
              remainingAmountMinor: recompute.remainingAmountMinor,
              status: recompute.status,
              principalMinor: amountChanged ? null : (row.original?.principal_minor ?? null),
              interestMinor: amountChanged ? null : (row.original?.interest_minor ?? null),
            });
          }

          const currentIds = new Set(planRows.map((r) => r.id).filter((rowId): rowId is string => !!rowId));
          const removedIds = installments.filter((inst) => !currentIds.has(inst.id)).map((inst) => inst.id);

          let insertedRows: Installment[] = [];
          if (preparedRows.length > 0 || removedIds.length > 0) {
            insertedRows = await updateInstallmentPlan({
              workspaceId: activeWorkspaceId,
              obligationId: id as string,
              rows: preparedRows,
              removedIds,
            });
          }

          // Toplu "ödendi" işaretleme: hem mevcut hem yeni eklenen (uzatılan) vadeler için
          // geçerlidir. Yeni satırların id'si insert öncesi bilinmediği için
          // updateInstallmentPlan eklenen satırları geri döndürür.
          const paidRows = planRows
            .filter((row) => row.markPaid && !row.locked)
            .map((row) => {
              const installmentId =
                row.id ?? insertedRows.find((i) => i.installment_number === row.installmentNumber)?.id ?? null;
              const amountMinor = parseValueUnitAmountToMinor(row.amountStr, valueUnitCode) ?? 0;
              return installmentId && amountMinor > 0
                ? {
                    workspace_id: activeWorkspaceId,
                    obligation_id: id as string,
                    installment_id: installmentId,
                    amount_minor: amountMinor,
                    paid_at: row.dueDate,
                    notes: 'Geçmiş vade, plan düzenlenirken ödendi işaretlendi',
                  }
                : null;
            })
            .filter((row): row is NonNullable<typeof row> => !!row);
          if (paidRows.length > 0) await recordPastInstallmentPayments(paidRows);
        }

        const obligation = await updateObligation(id, {
          direction,
          document_type: documentType,
          title: title.trim(),
          due_date: isPlanEditing ? planRows[0].dueDate : dueDate,
          counterparty_id: counterpartyIdForType,
          account_id: accountId,
          category_id: categoryId,
          bank_code: bankCodeForType,
          service_code: serviceCodeForType,
          total_amount_minor: isPlanEditing ? planTotalMinor : totalAmountMinor,
        });
        await syncObligationReminder(activeWorkspaceId, obligation);
        return obligation;
      }

      // Faiz oranı girildiyse taksitler azalan bakiye üzerinden hesaplanır; obligation'ın
      // toplamı taksitlerin gerçek toplamı (anapara+faiz) olmalı ki kalan borç/ilerleme
      // hesapları doğru kalsın.
      const installmentPlanItems = buildPlan();
      const obligationTotalMinor =
        installmentPlanItems.length > 0
          ? installmentPlanItems.reduce((sum, item) => sum + item.amountMinor, 0)
          : totalAmountMinor;

      const obligation = await createObligation({
        workspace_id: activeWorkspaceId,
        direction,
        document_type: documentType,
        title: title.trim(),
        total_amount_minor: obligationTotalMinor,
        currency_code: valueUnitCode,
        value_unit_type: valueUnit.unitType,
        due_date: dueDate,
        counterparty_id: counterpartyIdForType,
        account_id: accountId,
        category_id: categoryId,
        bank_code: bankCodeForType,
        service_code: serviceCodeForType,
      });

      if (installmentPlanItems.length > 0) {
        const createdInstallments = await createInstallmentPlan({
          workspaceId: activeWorkspaceId,
          obligationId: obligation.id,
          totalAmountMinor: obligationTotalMinor,
          installments: installmentPlanItems,
        });

        // "Ödendi" işaretlenen vadeler geçmiş tarihiyle, hiçbir hesaba bağlanmadan kaydedilir
        // (bkz. recordPastInstallmentPayments) — mevcut hesap bakiyeleri etkilenmez, yalnızca
        // taksit/borç durumu "ödendi" olur. Tamamı tek insert'te yazılır.
        const paidNumbers = new Set(installmentPlanItems.filter(isPreviewPaid).map((i) => i.installmentNumber));
        const paidRows = createdInstallments
          .filter((installment) => paidNumbers.has(installment.installment_number))
          .map((installment) => ({
            workspace_id: activeWorkspaceId,
            obligation_id: obligation.id,
            installment_id: installment.id,
            amount_minor: installment.amount_minor,
            paid_at: installment.due_date,
            notes: 'Geçmiş vade, kayıt oluşturulurken ödendi işaretlendi',
          }));
        if (paidRows.length > 0) await recordPastInstallmentPayments(paidRows);
      }

      // Nakit avans gerçekten çekilen nakittir — kesinti tutarı kart borcuna (yukarıdaki
      // obligation) eklenir ama kullanıcının eline geçen net tutar isteğe bağlı olarak bir
      // hesaba (kasa/banka) gelir kaydı olarak yatırılır. Borç tarafı ile hesap tarafı bu
      // yüzden ayrı kalemlerdir: fee kartın borcunu artırır, burada hiç görünmez.
      if (isCashAdvanceType && depositAccountId && enteredAmountMinor > 0) {
        await createTransaction({
          workspace_id: activeWorkspaceId,
          account_id: depositAccountId,
          direction: 'income',
          amount_minor: enteredAmountMinor,
          currency_code: valueUnitCode,
          occurred_at: new Date().toISOString(),
          description: `Nakit avans — ${title.trim()}`,
        });
      }

      await syncObligationReminder(activeWorkspaceId, obligation);

      return obligation;
    },
    onSuccess: () => {
      // Navigasyon, başarı Alert'inin "Tamam" butonuna ertelenir — bu hem kullanıcıya
      // net bir onay verir hem de Alert'in kapanış animasyonuyla ekran geçişinin aynı
      // anda tetiklenip Fabric'i çökertmesini önler (aynı çakışma sınıfı için bkz.
      // aşağıdaki deleteMutation).
      showSuccessAlert(isEditing ? 'Kayıt başarıyla güncellendi.' : 'Kayıt başarıyla oluşturuldu.', () => {
        router.back();
        InteractionManager.runAfterInteractions(() => {
          if (activeWorkspaceId) {
            queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'obligations'] });
          }
        });
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await deleteObligation(id as string);
    },
    onSuccess: () => {
      // Bu ekrana genelde /obligations/[id] detay sayfasından gelinir; oraya
      // router.back() ile dönmek, ['obligation', id] önbelleği tazelenene kadar
      // (veya hiç) az önce silinen kaydı göstermeye devam ediyordu. Silinen bir
      // kaydın detayına dönmek yerine doğrudan listeye çıkılır. Navigasyon başarı
      // Alert'inin "Tamam" butonuna ertelenir — bu sırayla çalıştığı için (silme
      // onayı Alert'i çoktan kapanmış olur) Fabric çakışma riski oluşmaz.
      showSuccessAlert('Kayıt başarıyla silindi.', () => {
        router.replace('/(tabs)/hareketler');
        InteractionManager.runAfterInteractions(() => {
          if (activeWorkspaceId) {
            queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'obligations'] });
          }
          queryClient.removeQueries({ queryKey: ['obligation', id] });
        });
      });
    },
  });

  function confirmDelete() {
    Alert.alert(
      'Kaydı Sil',
      hasInstallments
        ? 'Bu kayıt, taksitleri ve ödeme geçmişi kalıcı olarak silinecek. Emin misiniz?'
        : 'Bu kayıt ve varsa ödeme geçmişi kalıcı olarak silinecek. Emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ]
    );
  }

  const canSubmit =
    !!title.trim() &&
    (isPlanEditing ? planTotalMinor > 0 && !planError : totalAmountMinor > 0) &&
    !!documentType &&
    (!isLoanType || !!bankCode) &&
    (!isCashAdvanceType || !!accountId) &&
    (!isCardStatementType || !!accountId);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard }}>
          <Stack gap="lg">
            <Row align="center">
              <Pressable onPress={() => router.back()} hitSlop={12}>
                <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
              </Pressable>
              <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
                {isEditing ? 'Borç / Alacağı Düzenle' : 'Yeni Borç / Alacak'}
              </Text>
            </Row>

            <SegmentedControl
              options={DIRECTIONS.map((d) => ({ key: d.value, label: d.label }))}
              value={direction}
              onChange={(value) => {
                setDirection(value);
                setCategoryId(null);
                if (value === 'payable' && accountsQuery.data?.find((a) => a.id === accountId)?.type === 'pos') {
                  setAccountId(null);
                }
              }}
              stretch
            />

            <TextField label="BAŞLIK" placeholder="Örn. Ocak ayı kira çeki" value={title} onChangeText={setTitle} />

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                DEĞER BİRİMİ
              </Text>
              {isEditing ? (
                // docs/01-finansal-kayit-modeli.md §3.5 — birim kayıt oluşturulduktan
                // sonra değiştirilemez; burada yalnızca bilgi amaçlı gösterilir.
                <Text variant="body" color="textSecondary">
                  {VALUE_UNIT_LABEL[valueUnitCode] ?? valueUnitCode}
                </Text>
              ) : (
                <ValueUnitPicker selectedId={valueUnitCode} onSelect={setValueUnitCode} />
              )}
            </Stack>

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                {isPerInstallmentMode
                  ? `${periodLabels.unitTitle.toLocaleUpperCase('tr-TR')} BAŞINA TUTAR (${valueUnit.quantityLabel})`
                  : `TUTAR (${valueUnit.quantityLabel})`}
              </Text>
              {isPlanEditing ? (
                <Text variant="body" color="textSecondary">
                  {formatValueUnitAmount(planTotalMinor, valueUnitCode)} — aşağıdaki taksit planının toplamıdır.
                </Text>
              ) : (
                <AmountField
                  placeholder={valueUnit.precision === 0 ? '1' : '0,00'}
                  precision={valueUnit.precision}
                  value={totalAmount}
                  onChangeText={setTotalAmount}
                />
              )}
              {/* Girilen tutarın toplam mı yoksa her vadenin tutarı mı olduğu, kullanıcının
                  gördüğü ilk şey olmalı — maaş/kira gibi kayıtlarda toplamın vadelere
                  bölünmesi sessiz ve fark edilmesi güç bir hataya yol açıyordu. */}
              {showAmountModeSelector ? (
                <Stack gap="xs">
                  <SegmentedControl
                    options={[
                      { key: 'total', label: 'Toplam tutar' },
                      { key: 'per_installment', label: `Her ${periodLabels.unit} tutarı` },
                    ]}
                    value={amountMode}
                    onChange={(value) => {
                      setAmountMode(value);
                      setAmountModeTouched(true);
                    }}
                    stretch
                  />
                  <Text variant="caption" color="textSecondary">
                    {isPerInstallmentMode
                      ? `Girilen tutar her ${periodLabels.unit} için ayrı ayrı işlenir; toplam ${formatValueUnitAmount(totalAmountMinor, valueUnitCode)} olur.`
                      : `Girilen tutar toplam borçtur; ${installmentCount} ${periodLabels.unitDative} bölünür.`}
                  </Text>
                </Stack>
              ) : null}
            </Stack>

            {isPlanEditing ? null : (
              <DateField
                label={!isEditing && installmentCount > 1 ? 'İLK VADE' : 'VADE'}
                value={dueDate}
                onChangeText={setDueDate}
              />
            )}

            {isPlanEditing ? (
              <InstallmentPlanEditor
                rows={planRows}
                unitLabel={unitLabel}
                precision={valueUnit.precision}
                currencyCode={valueUnitCode}
                minCount={minPlanCount}
                onStartDateChange={updatePlanStartDate}
                onDateChange={updatePlanRowDate}
                onAmountChange={updatePlanRowAmount}
                onAdd={addPlanRow}
                onRemoveLast={removeLastPlanRow}
                onTogglePaid={togglePlanRowPaid}
                onExtend={extendPlan}
              />
            ) : null}

            {planError ? (
              <Text variant="caption" color="danger">
                {planError}
              </Text>
            ) : null}

            {isLoanType || isSubscriptionType || isCashAdvanceType || isCardStatementType ? null : (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  {isSalaryType ? 'PERSONEL' : 'KİŞİ / FİRMA'}
                </Text>
                {activeWorkspaceId ? (
                  <CounterpartyPicker
                    workspaceId={activeWorkspaceId}
                    counterparties={counterpartiesQuery.data ?? []}
                    selectedId={counterpartyId}
                    onSelect={setCounterpartyId}
                    // Maaş kaydında listede olmayan bir isim yazılıp oluşturulursa doğrudan
                    // personel olarak kaydedilir; müşteri/tedarikçi listesine karışmaz.
                    defaultType={isSalaryType ? 'personel' : 'individual'}
                    placeholder={isSalaryType ? 'Personel seçin' : 'Kişi / firma seçin'}
                    onCreated={() => {
                      queryClient.invalidateQueries({ queryKey: queryKeys.counterparties(activeWorkspaceId) });
                    }}
                  />
                ) : null}
              </Stack>
            )}

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                BELGE TÜRÜ
              </Text>
              <DocumentTypePicker
                selectedId={documentType}
                onSelect={(value) => {
                  setDocumentType(value);
                  // Tutar modu belge türünün doğal anlamını izler (kredide toplam, maaş/kirada
                  // her vade) — kullanıcı seçimi elle değiştirmediyse tür değişince güncellenir.
                  if (!amountModeTouched) setAmountMode(getDefaultAmountMode(value));
                  // Nakit avans/kredi kartı ekstresinde HESAP yalnızca kredi kartı olabilir —
                  // önceden seçilmiş bir kart-dışı hesap varsa (veya tersi yönde geçilirken)
                  // geçersiz kalmasın diye temizlenir.
                  if (
                    (value === 'nakit_avans' || value === 'kredi_karti_ekstresi') &&
                    !creditCardAccounts.some((a) => a.id === accountId)
                  ) {
                    setAccountId(null);
                  }
                }}
              />
            </Stack>

            {documentType && BANK_DOCUMENT_TYPES.has(documentType) ? (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  {isLoanType ? 'BANKA' : 'BANKA (İSTEĞE BAĞLI)'}
                </Text>
                <BankPicker selectedId={bankCode} onSelect={setBankCode} />
              </Stack>
            ) : null}

            {isSubscriptionType ? (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  SERVİS (İSTEĞE BAĞLI)
                </Text>
                <ServicePicker selectedId={serviceCode} onSelect={setServiceCode} />
              </Stack>
            ) : null}

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                KATEGORİ (İSTEĞE BAĞLI)
              </Text>
              {(categoriesQuery.data ?? []).length === 0 ? (
                <Text variant="body" color="textSecondary">
                  Bu türde kategori bulunamadı.
                </Text>
              ) : (
                <CategoryPicker
                  categories={categoriesQuery.data ?? []}
                  selectedId={categoryId}
                  onSelect={setCategoryId}
                />
              )}
            </Stack>

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                {isCashAdvanceType || isCardStatementType ? 'KREDİ KARTI' : 'HESAP (İSTEĞE BAĞLI)'}
              </Text>
              {(isCashAdvanceType || isCardStatementType ? creditCardAccounts : generalAccounts).length === 0 ? (
                <Text variant="body" color="textSecondary">
                  {isCashAdvanceType || isCardStatementType
                    ? "Önce Hesaplar'dan bir kredi kartı ekleyin."
                    : "Önce Hesaplar'dan bir hesap ekleyin."}
                </Text>
              ) : (
                <AccountPicker
                  accounts={isCashAdvanceType || isCardStatementType ? creditCardAccounts : generalAccounts}
                  selectedId={accountId}
                  onSelect={setAccountId}
                />
              )}
            </Stack>

            {isCashAdvanceType && !isEditing ? (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  NAKİT NEREYE YATIRILDI? (İSTEĞE BAĞLI)
                </Text>
                {depositTargetAccounts.length === 0 ? (
                  <Text variant="body" color="textSecondary">
                    Nakdi bir kasa/banka hesabına yatırdıysanız önce o hesabı ekleyin.
                  </Text>
                ) : (
                  <AccountPicker
                    accounts={depositTargetAccounts}
                    selectedId={depositAccountId}
                    onSelect={setDepositAccountId}
                    title="Hesap Seç"
                    placeholder="Hesap seçin"
                  />
                )}
                <Text variant="caption" color="textSecondary">
                  Seçilirse çekilen tutar (TUTAR alanı, faizden etkilenmez) o hesaba gelir olarak
                  otomatik işlenir.
                </Text>
              </Stack>
            ) : null}

            {/* docs/01-finansal-kayit-modeli.md §3.5 — kıymetli maden/döviz kaydı bu turda
                yalnızca tek seferlik borç/alacak olarak tutulur (bkz. yukarıdaki
                installmentCount hesaplaması); taksitlendirme yalnızca fiat'ta gösterilir. */}
            {isEditing || !isFiatUnit ? null : (
              <TextField
                label={periodLabels.countLabel}
                placeholder="1"
                keyboardType="number-pad"
                value={installmentCountStr}
                onChangeText={setInstallmentCountStr}
              />
            )}

            {showInterestField ? (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  AYLIK FAİZ ORANI % (İSTEĞE BAĞLI)
                </Text>
                <TextField
                  placeholder="2,5"
                  keyboardType="decimal-pad"
                  value={interestRateStr}
                  onChangeText={setInterestRateStr}
                />
                <Text variant="caption" color="textSecondary">
                  {isCashAdvanceType
                    ? 'TUTAR alanı çekilen nakittir; taksitler azalan bakiye üzerinden hesaplanır — çekilen tutar değişmez, yalnızca toplam ödemeye faiz eklenir.'
                    : 'TUTAR alanı anaparadır; taksitler azalan bakiye üzerinden hesaplanır (banka kredisi gibi).'}
                </Text>
              </Stack>
            ) : null}

            {installmentPreview.length > 0 ? (
              <Stack gap="sm">
                <Row align="center">
                  <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                    {`${periodLabels.unitTitle.toLocaleUpperCase('tr-TR')} ÖNİZLEME`}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    Toplam {formatMinorAmount(installmentPreview.reduce((sum, i) => sum + i.amountMinor, 0))}
                  </Text>
                </Row>
                {/* Geçmişe dönük plan girenler için toplu işaretleme özeti — kullanıcı kaç
                    vadenin ödendi sayılacağını kaydetmeden önce görür. */}
                {paidPreviewCount > 0 ? (
                  <Text variant="caption" style={{ color: theme.colors.success }}>
                    {paidPreviewCount} {periodLabels.unit} ödendi olarak kaydedilecek (
                    {formatMinorAmount(
                      installmentPreview.filter(isPreviewPaid).reduce((sum, i) => sum + i.amountMinor, 0)
                    )}
                    ). Bu ödemeler geçmiş tarihli işlenir ve hesap bakiyelerinizi değiştirmez.
                  </Text>
                ) : null}
                <InstallmentPreviewTimeline
                  items={installmentPreview}
                  unitLabel={periodLabels.unit}
                  isPaid={isPreviewPaid}
                  onTogglePaid={togglePreviewPaid}
                />
              </Stack>
            ) : null}

            {saveMutation.error ? (
              <Text variant="caption" color="danger">
                {saveMutation.error instanceof Error ? saveMutation.error.message : 'Kayıt kaydedilemedi'}
              </Text>
            ) : null}

            <Button
              label={isEditing ? 'Güncelle' : 'Kaydet'}
              onPress={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              disabled={!canSubmit}
            />

            {isEditing ? (
              <Button
                label="Sil"
                variant="danger"
                onPress={confirmDelete}
                loading={deleteMutation.isPending}
                disabled={saveMutation.isPending}
              />
            ) : null}
          </Stack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface InstallmentPlanEditorProps {
  rows: PlanRow[];
  unitLabel: string;
  precision: 0 | 2;
  currencyCode: string;
  /** Kuyruk yalnızca bu sayının altına inecek şekilde kısaltılamaz (ödenmiş taksitleri korur). */
  minCount: number;
  onStartDateChange: (value: string) => void;
  onDateChange: (index: number, value: string) => void;
  onAmountChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemoveLast: () => void;
  onTogglePaid: (index: number, value: boolean) => void;
  onExtend: (count: number, amountStr: string | null) => void;
}

// Mevcut bir taksit planını düzenleme UI'ı: aynı "taksit zaman çizgisi" görsel dili
// (bkz. app/obligations/[id].tsx TimelineInstallmentRow, InstallmentPreviewTimeline
// aşağıda) — ama satırlar burada canlı düzenlenebilir. Ödenmiş taksitler (yeşil, kilitli)
// tarih/tutar alanı göstermez ve kaldırılamaz; yalnızca kuyruktaki son taksit "+ Taksit
// Ekle" / çöp kutusu ile büyütülüp küçültülebilir (docs/01-finansal-kayit-modeli.md §8.1
// — taksit toplamı, obligation'ın total_amount_minor'ıyla her zaman birebir örtüşmeli).
function InstallmentPlanEditor({
  rows,
  unitLabel,
  precision,
  currencyCode,
  minCount,
  onStartDateChange,
  onDateChange,
  onAmountChange,
  onAdd,
  onRemoveLast,
  onTogglePaid,
  onExtend,
}: InstallmentPlanEditorProps) {
  const theme = useTheme();
  const firstRow = rows[0] ?? null;
  const lastIndex = rows.length - 1;
  const canRemoveLast = rows.length > minCount && lastIndex >= 0 && !rows[lastIndex].locked;
  const [extendCountStr, setExtendCountStr] = useState('');
  const [extendAmountStr, setExtendAmountStr] = useState('');
  const extendCount = Math.max(0, Math.min(60, parseInt(extendCountStr, 10) || 0));
  const markedPaidCount = rows.filter((row) => row.markPaid && !row.locked).length;

  return (
    <Stack gap="sm">
      <Text variant="caption" color="textSecondary">
        TAKSİT PLANI
      </Text>

      <Stack gap="sm">
        <Text variant="caption" color="textSecondary">
          BAŞLANGIÇ TARİHİ
        </Text>
        {!firstRow || firstRow.locked ? (
          <Text variant="body" color="textSecondary">
            {firstRow ? shortDateFormatter.format(new Date(firstRow.dueDate)) : '—'} — ilk {unitLabel.toLocaleLowerCase('tr-TR')}
            {' '}ödendiği için başlangıç tarihi değiştirilemez.
          </Text>
        ) : (
          <DateField value={firstRow.dueDate} onChangeText={onStartDateChange} />
        )}
      </Stack>

      <Stack gap="xxs">
        {rows.map((row, index) => {
          const isLast = index === lastIndex;
          // Kaydedilince ödenmiş olacak satırlar da yeşil görünür — kullanıcı kaydetmeden
          // önce sonucu görür.
          const showsPaid = row.locked || row.markPaid;
          const markerBg = showsPaid ? theme.colors.success : 'transparent';
          const markerBorder = showsPaid ? theme.colors.success : theme.colors.border;

          return (
            <Row
              key={row.id ?? `new-${row.installmentNumber}`}
              gap="sm"
              align="stretch"
              style={{ marginBottom: isLast ? 0 : theme.spacing.sm }}
            >
              <Stack gap="xs" align="center" style={{ width: 32 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    borderWidth: showsPaid ? 0 : 1.5,
                    borderColor: markerBorder,
                    backgroundColor: markerBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {showsPaid ? (
                    <Ionicons name="checkmark" size={16} color={theme.colors.brandPrimaryText} />
                  ) : (
                    <Text variant="caption" style={{ color: theme.colors.textSecondary, fontWeight: '700' }}>
                      {row.installmentNumber}
                    </Text>
                  )}
                </View>
                {!isLast ? (
                  <View
                    style={{
                      flex: 1,
                      width: 2,
                      borderRadius: 1,
                      backgroundColor: showsPaid ? theme.colors.success : theme.colors.border,
                    }}
                  />
                ) : null}
              </Stack>

              <View style={{ flex: 1 }}>
                <Card>
                  {row.locked ? (
                    <Row gap="sm" align="center">
                      <Stack gap="xxs" style={{ flex: 1 }}>
                        <Text variant="cardTitle" numberOfLines={1}>
                          {row.installmentNumber}. {unitLabel} — {shortDateFormatter.format(new Date(row.dueDate))}
                        </Text>
                        <Text variant="caption" style={{ color: theme.colors.success, fontWeight: '600' }}>
                          Ödendi
                        </Text>
                      </Stack>
                      <Text variant="body" tabular>
                        {formatValueUnitAmount(row.original?.amount_minor ?? 0, currencyCode)}
                      </Text>
                    </Row>
                  ) : (
                    <Stack gap="sm">
                      <Row align="center">
                        <Text variant="cardTitle" style={{ flex: 1 }}>
                          {row.installmentNumber}. {unitLabel}
                        </Text>
                        {isLast && canRemoveLast ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Taksiti kaldır"
                            onPress={onRemoveLast}
                            hitSlop={8}
                          >
                            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                          </Pressable>
                        ) : null}
                      </Row>
                      <DateField value={row.dueDate} onChangeText={(value) => onDateChange(index, value)} />
                      <AmountField
                        placeholder={precision === 0 ? '1' : '0,00'}
                        precision={precision}
                        value={row.amountStr}
                        onChangeText={(value) => onAmountChange(index, value)}
                      />
                      <Row gap="sm" align="center">
                        <Text
                          variant="caption"
                          style={{
                            flex: 1,
                            color: row.markPaid ? theme.colors.success : theme.colors.textSecondary,
                          }}
                        >
                          {row.markPaid ? 'Ödendi olarak kaydedilecek' : 'Ödenmedi'}
                        </Text>
                        <Switch
                          value={row.markPaid}
                          onValueChange={(value) => onTogglePaid(index, value)}
                        />
                      </Row>
                    </Stack>
                  )}
                </Card>
              </View>
            </Row>
          );
        })}
      </Stack>

      {markedPaidCount > 0 ? (
        <Text variant="caption" style={{ color: theme.colors.success }}>
          {markedPaidCount} {unitLabel.toLocaleLowerCase('tr-TR')} ödendi olarak kaydedilecek. Bu ödemeler
          vade tarihiyle işlenir ve hesap bakiyelerinizi değiştirmez.
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${unitLabel} ekle`}
        onPress={onAdd}
        style={{ alignSelf: 'flex-start', paddingVertical: theme.spacing.xs }}
      >
        <Row gap="xs" align="center">
          <Ionicons name="add-circle-outline" size={18} color={theme.colors.brandPrimary} />
          <Text variant="body" style={{ color: theme.colors.brandPrimary, fontWeight: '600' }}>
            {unitLabel} Ekle
          </Text>
        </Row>
      </Pressable>

      {/* Planı uzat: sözleşme yenilendiğinde (maaş zammı, kira artışı) plana tek seferde
          N vade eklemek için. Tutar boş bırakılırsa son vadenin tutarı sürer. */}
      <Card>
        <Stack gap="sm">
          <Text variant="caption" color="textSecondary">
            PLANI UZAT
          </Text>
          <Row gap="sm" align="center">
            <View style={{ flex: 1 }}>
              <TextField
                label={`KAÇ ${unitLabel.toLocaleUpperCase('tr-TR')}`}
                placeholder="12"
                keyboardType="number-pad"
                value={extendCountStr}
                onChangeText={setExtendCountStr}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AmountField
                label="YENİ TUTAR"
                placeholder={rows[lastIndex]?.amountStr || (precision === 0 ? '1' : '0,00')}
                precision={precision}
                value={extendAmountStr}
                onChangeText={setExtendAmountStr}
              />
            </View>
          </Row>
          <Text variant="caption" color="textSecondary">
            Tutar boş bırakılırsa son {unitLabel.toLocaleLowerCase('tr-TR')} tutarı ({
              formatValueUnitAmount(
                parseValueUnitAmountToMinor(rows[lastIndex]?.amountStr ?? '', currencyCode) ?? 0,
                currencyCode
              )
            }) devam eder.
          </Text>
          <Button
            label="Planı Uzat"
            variant="secondary"
            icon="calendar-outline"
            disabled={extendCount <= 0}
            onPress={() => {
              onExtend(extendCount, extendAmountStr.trim() || null);
              setExtendCountStr('');
              setExtendAmountStr('');
            }}
          />
        </Stack>
      </Card>
    </Stack>
  );
}

// app/obligations/[id].tsx'teki gerçek taksit listesinin ("taksit zaman çizgisi",
// docs/08-tasarim-sistemi.md §12.15) önizleme karşılığı — numaralı işaretçiler + bağlayan
// dikey çizgi + kart satırları aynı görsel dilde, ama bunlar henüz kaydedilmemiş taslak
// veri olduğu için ödendi/sıradaki durumu yok: yalnızca ilk taksit vurgulanır (bir sonraki
// ödeme olacağı için), diğerleri nötr anahat kalır.
function InstallmentPreviewTimeline({
  items,
  unitLabel,
  isPaid,
  onTogglePaid,
}: {
  items: InstallmentPlanItem[];
  unitLabel: string;
  /** Verilirse her satırda "Ödendi" anahtarı gösterilir (bkz. toplu ödendi akışı). */
  isPaid?: (item: InstallmentPlanItem) => boolean;
  onTogglePaid?: (installmentNumber: number, value: boolean) => void;
}) {
  const theme = useTheme();
  const editable = !!isPaid && !!onTogglePaid;

  return (
    <Stack gap="xxs">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const paid = isPaid?.(item) ?? false;
        // Ödendi işaretlenen satır yeşil dolu; işaretlenmemişlerde ilk satır "sıradaki"
        // olarak Saffron vurgulanır (gerçek taksit listesiyle aynı görsel dil).
        const isNext = !paid && items.findIndex((i) => !(isPaid?.(i) ?? false)) === index;
        const markerBg = paid ? theme.colors.success : isNext ? theme.colors.brandPrimary : 'transparent';
        const markerBorder = paid
          ? theme.colors.success
          : isNext
            ? theme.colors.brandPrimary
            : theme.colors.border;
        const markerTextColor = paid || isNext ? theme.colors.brandPrimaryText : theme.colors.textSecondary;

        return (
          <Row
            key={item.installmentNumber}
            gap="sm"
            align="stretch"
            style={{ marginBottom: isLast ? 0 : theme.spacing.sm }}
          >
            <Stack gap="xs" align="center" style={{ width: 32 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  borderWidth: paid || isNext ? 0 : 1.5,
                  borderColor: markerBorder,
                  backgroundColor: markerBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {paid ? (
                  <Ionicons name="checkmark" size={16} color={theme.colors.brandPrimaryText} />
                ) : (
                  <Text variant="caption" style={{ color: markerTextColor, fontWeight: '700' }}>
                    {item.installmentNumber}
                  </Text>
                )}
              </View>
              {!isLast ? (
                <View
                  style={{
                    flex: 1,
                    width: 2,
                    borderRadius: 1,
                    backgroundColor: paid ? theme.colors.success : theme.colors.border,
                  }}
                />
              ) : null}
            </Stack>

            <View style={{ flex: 1 }}>
              <Card elevated={isNext}>
                <Stack gap="sm">
                  <Row gap="sm" align="center">
                    <Stack gap="xxs" style={{ flex: 1 }}>
                      <Text variant="cardTitle" numberOfLines={1}>
                        {item.installmentNumber}. {unitLabel} — {shortDateFormatter.format(new Date(item.dueDate))}
                      </Text>
                      {item.interestMinor > 0 ? (
                        <Text variant="caption" color="textSecondary">
                          Anapara {formatMinorAmount(item.principalMinor)} · Faiz {formatMinorAmount(item.interestMinor)}
                        </Text>
                      ) : null}
                    </Stack>
                    <Text variant="body" tabular>
                      {formatMinorAmount(item.amountMinor)}
                    </Text>
                  </Row>
                  {editable ? (
                    <Row gap="sm" align="center">
                      <Text
                        variant="caption"
                        style={{ flex: 1, color: paid ? theme.colors.success : theme.colors.textSecondary }}
                      >
                        {paid ? 'Ödendi' : 'Ödenmedi'}
                      </Text>
                      <Switch value={paid} onValueChange={(value) => onTogglePaid?.(item.installmentNumber, value)} />
                    </Row>
                  ) : null}
                </Stack>
              </Card>
            </View>
          </Row>
        );
      })}
    </Stack>
  );
}
