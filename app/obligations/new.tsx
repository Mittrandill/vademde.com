import { useEffect, useState } from 'react';
import { Alert, InteractionManager, KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useExitGuard } from '@/utils/useExitGuard';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useReflowKey } from '@/services/reflow';
import { AmountField, Button, Card, DateField, FieldGroup, FormRow, Group, Pagination, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
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
  LENDING_DOCUMENT_TYPE,
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
import { queryKeys, invalidatePaymentRelatedQueries } from '@/services/queryKeys';
import { syncObligationReminder } from '@/services/notifications';
import { showSuccessAlert } from '@/utils/alerts';
import { ScanPromptBanner } from '@/components/finance/ScanPromptBanner';

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
  const { id, type, accountId, dueDate, counterpartyId, direction, title: titleParam, amountMinor: amountParam } =
    useLocalSearchParams<{
    id?: string;
    /** e-Fatura karekodundan gelen ön doldurma (bkz. app/(tabs)/tara.tsx) — kullanıcı onaylar. */
    title?: string;
    amountMinor?: string;
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
      initialTitle={typeof titleParam === 'string' ? titleParam : undefined}
      initialAmountMinor={typeof amountParam === 'string' && /^\d+$/.test(amountParam) ? Number(amountParam) : undefined}
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
  initialTitle?: string;
  /** TRY kuruşu; yalnızca yeni kayıtta ön doldurma. */
  initialAmountMinor?: number;
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
  initialTitle,
  initialAmountMinor,
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
  // Aboneliklere özel iki isteğe bağlı alan; NULL billing_period bugünkü aylık plandır.
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>(
    initial?.billing_period === 'yearly' ? 'yearly' : 'monthly'
  );
  const [trialEndsOn, setTrialEndsOn] = useState(initial?.trial_ends_on ?? '');
  const [title, setTitle] = useState(initial?.title ?? initialTitle ?? '');
  const { allowExit } = useExitGuard(!isEditing && title.trim() !== '');
  // docs/01-finansal-kayit-modeli.md §3.5 — birim, kayıt oluşturulduktan sonra
  // değiştirilemez; edit modda initial.currency_code sabit kalır (aşağıda salt-okunur
  // gösterilir). Yeni kayıtta workspace'in varsayılan birimi hazır olana kadar 'TRY' ile
  // başlar, aşağıdaki efekt bir kez gerçek varsayımla günceller.
  const [valueUnitCode, setValueUnitCode] = useState(initial?.currency_code ?? 'TRY');
  const [valueUnitDefaulted, setValueUnitDefaulted] = useState(!!initial);
  const [totalAmount, setTotalAmount] = useState(() => {
    if (!initial) {
      return initialAmountMinor ? formatAmountInput((initialAmountMinor / 100).toFixed(2).replace('.', ','), 2) : '';
    }
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
  // 2. adım (taksit planı) yalnızca yeni kayıtta ve taksit sayısı 1'den fazlaysa açılır.
  const [step, setStep] = useState<1 | 2>(1);
  const [planPage, setPlanPage] = useState(0);
  const [editingPlan, setEditingPlan] = useState(false);

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
  // Yıllık aboneliklerde vadeler 12 ayda bir dizilir; diğer tüm türlerde aylık.
  const stepMonths = isSubscriptionType && billingPeriod === 'yearly' ? 12 : 1;
  // Nakit avans: borçlu taraf kart hesabıdır (kişi/firma alanı anlamsız, kredi/abonelik ile
  // aynı gerekçe — bkz. COUNTERPARTY_LESS_DOCUMENT_TYPES), HESAP zorunludur ve yalnızca kredi
  // kartı hesapları arasından seçilir; ayrıca çekilen nakit gerçekten bir hesaba yatırılabilir.
  const isCashAdvanceType = documentType === 'nakit_avans';
  // Borç verme: ödünç verilen nakit/altın/döviz gerçekten bir hesaptan çıkar — KAYNAK HESAP
  // zorunludur ve yalnızca gerçek bakiyesi olan hesaplar arasından (kasa/banka) seçilir;
  // DEĞER BİRİMİ o hesabın biriminden türetilir (o hesapta ne varsa onunla ödünç verilir).
  const isLendingType = documentType === LENDING_DOCUMENT_TYPE;
  const lendingSourceAccounts = (accountsQuery.data ?? []).filter((a) => a.type === 'cash' || a.type === 'bank');
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
      rows.map((r) => (r.locked ? r : { ...r, dueDate: addMonthsToIsoDate(value, (r.installmentNumber - 1) * stepMonths) }))
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
          dueDate: last ? addMonthsToIsoDate(last.dueDate, stepMonths) : new Date().toISOString().slice(0, 10),
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
          dueDate: last ? addMonthsToIsoDate(last.dueDate, stepMonths) : new Date().toISOString().slice(0, 10),
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
      ? buildFixedInstallments(enteredAmountMinor, installmentCount, dueDate, stepMonths)
      : buildAmortizedInstallments(totalAmountMinor, installmentCount, dueDate, interestRatePercent);
  }

  // Önizleme satırları kaydetmeden önce elle düzenlenebilir (vade tarihi / tutar), OCR onay
  // ekranındaki gibi. Düzenlemeler yalnızca üretildikleri planın imzasına bağlıdır: taksit
  // sayısı/tutar/başlangıç/faiz değişince plan yeniden üretilir ve düzenlemeler sıfırlanır.
  const basePlan = isEditing ? [] : buildPlan();
  const planSignature = basePlan.map((i) => `${i.dueDate}:${i.amountMinor}`).join('|');
  const [planEditState, setPlanEditState] = useState<{
    signature: string;
    edits: Record<number, { dueDate?: string; amountStr?: string }>;
  }>({ signature: '', edits: {} });
  const planEdits = planEditState.signature === planSignature ? planEditState.edits : {};

  function editPlanItem(installmentNumber: number, patch: { dueDate?: string; amountStr?: string }) {
    setPlanEditState({
      signature: planSignature,
      edits: { ...planEdits, [installmentNumber]: { ...planEdits[installmentNumber], ...patch } },
    });
  }

  function buildEffectivePlan(): InstallmentPlanItem[] {
    return basePlan.map((item) => {
      const edit = planEdits[item.installmentNumber];
      if (!edit) return item;
      const amountMinor =
        edit.amountStr !== undefined
          ? (parseValueUnitAmountToMinor(edit.amountStr, valueUnitCode) ?? item.amountMinor)
          : item.amountMinor;
      return {
        ...item,
        dueDate: edit.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(edit.dueDate) ? edit.dueDate : item.dueDate,
        amountMinor,
        principalMinor: Math.max(amountMinor - item.interestMinor, 0),
      };
    });
  }
  const installmentPreview = buildEffectivePlan();

  const todayIso = new Date().toISOString().slice(0, 10);
  function isPreviewPaid(item: InstallmentPlanItem): boolean {
    return paidOverrides[item.installmentNumber] ?? item.dueDate < todayIso;
  }
  function togglePreviewPaid(installmentNumber: number, value: boolean) {
    setPaidOverrides((prev) => ({ ...prev, [installmentNumber]: value }));
  }
  const paidPreviewCount = installmentPreview.filter(isPreviewPaid).length;
  const needsPlanStep = !isEditing && installmentCount > 1;
  const inPlanStep = step === 2 && needsPlanStep;

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
          billing_period: isSubscriptionType ? billingPeriod : null,
          trial_ends_on: isSubscriptionType && /^\d{4}-\d{2}-\d{2}$/.test(trialEndsOn.trim()) ? trialEndsOn.trim() : null,
          total_amount_minor: isPlanEditing ? planTotalMinor : totalAmountMinor,
        });
        await syncObligationReminder(activeWorkspaceId, obligation);
        return obligation;
      }

      // Faiz oranı girildiyse taksitler azalan bakiye üzerinden hesaplanır; obligation'ın
      // toplamı taksitlerin gerçek toplamı (anapara+faiz) olmalı ki kalan borç/ilerleme
      // hesapları doğru kalsın.
      const installmentPlanItems = buildEffectivePlan();
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
        billing_period: isSubscriptionType ? billingPeriod : null,
        trial_ends_on: isSubscriptionType && /^\d{4}-\d{2}-\d{2}$/.test(trialEndsOn.trim()) ? trialEndsOn.trim() : null,
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
          // Çekilen nakit borçtur, gelir değil: hesap bakiyesine girer, gelir raporuna girmez.
          financing_minor: enteredAmountMinor,
          source_obligation_id: obligation.id,
          currency_code: valueUnitCode,
          occurred_at: new Date().toISOString(),
          description: `Nakit avans — ${title.trim()}`,
        });
      }

      // Ödünç verilen nakit/altın/döviz gerçekten kaynak hesaptan çıkar — borç tarafı
      // (yukarıdaki obligation, direction='receivable') kişinin size borcunu tutar; hesap
      // tarafı ise ayrı bir gider hareketiyle KAYNAK HESAP'ın bakiyesini düşürür. Geri
      // alındığında kullanıcı obligation detayından "Ödeme Ekle" ile normal şekilde tahsil
      // eder (bkz. app/obligations/[id].tsx PaymentForm) — o akış zaten hesap seçtirip
      // ilişkili bir gelir hareketi oluşturuyor, ekstra kod gerekmez.
      if (isLendingType && accountId && enteredAmountMinor > 0) {
        await createTransaction({
          workspace_id: activeWorkspaceId,
          account_id: accountId,
          direction: 'expense',
          amount_minor: enteredAmountMinor,
          // Ödünç verilen para gider değildir (geri alınacak): bakiyeden düşer, gider raporuna girmez.
          financing_minor: enteredAmountMinor,
          source_obligation_id: obligation.id,
          currency_code: valueUnitCode,
          occurred_at: new Date().toISOString(),
          description: `Ödünç verildi — ${title.trim()}`,
        });
      }

      await syncObligationReminder(activeWorkspaceId, obligation);

      return obligation;
    },
    onSuccess: () => {
      allowExit();
      // Navigasyon, başarı Alert'inin "Tamam" butonuna ertelenir — bu hem kullanıcıya
      // net bir onay verir hem de Alert'in kapanış animasyonuyla ekran geçişinin aynı
      // anda tetiklenip Fabric'i çökertmesini önler (aynı çakışma sınıfı için bkz.
      // aşağıdaki deleteMutation).
      showSuccessAlert(isEditing ? 'Kayıt başarıyla güncellendi.' : 'Kayıt başarıyla oluşturuldu.', () => {
        router.back();
        InteractionManager.runAfterInteractions(() => {
          // Yalnızca [workspaceId, 'obligations'] tazelenirse cari detayındaki bakiye
          // ([workspaceId, 'counterparties', id, 'ledger']) sayfadan çıkıp tekrar girene kadar
          // eski kalıyordu — bkz. invalidatePaymentRelatedQueries'in artık kapsadığı prefix'ler.
          if (activeWorkspaceId) {
            invalidatePaymentRelatedQueries(queryClient, activeWorkspaceId);
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
            invalidatePaymentRelatedQueries(queryClient, activeWorkspaceId);
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
    (!isCardStatementType || !!accountId) &&
    (!isLendingType || !!accountId);

  const detailAccounts = isLendingType ? lendingSourceAccounts : isCashAdvanceType || isCardStatementType ? creditCardAccounts : generalAccounts;
  const accountRowLabel = isLendingType ? 'Kaynak hesap' : isCashAdvanceType || isCardStatementType ? 'Kredi kartı' : 'Hesap';

  if (inPlanStep) {
    const totalPages = Math.max(1, Math.ceil(installmentPreview.length / PLAN_PAGE_SIZE));
    const page = Math.min(planPage, totalPages - 1);
    const pageItems = installmentPreview.slice(page * PLAN_PAGE_SIZE, (page + 1) * PLAN_PAGE_SIZE);
    const planTotal = installmentPreview.reduce((sum, i) => sum + i.amountMinor, 0);

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard }} keyboardShouldPersistTaps="handled">
            <Stack gap="lg">
              <ScreenHeader inline title="Taksit planı" leftLabel={{ label: 'Geri', onPress: () => setStep(1) }} />

              <Stack gap="xs">
                <Row align="center" gap="sm">
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="caption" color="textSecondary">
                      {installmentPreview.length} {periodLabels.unit.toLocaleLowerCase('tr-TR')} · Toplam
                    </Text>
                    <Text variant="displayAmount" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                      {formatMinorAmount(planTotal, valueUnitCode)}
                    </Text>
                  </Stack>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setEditingPlan((value) => !value)}
                    style={{
                      height: 34,
                      paddingHorizontal: 16,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: editingPlan ? theme.colors.action : theme.colors.fill,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: editingPlan ? theme.colors.onAction : theme.colors.textPrimary }}>
                      {editingPlan ? 'Bitti' : 'Düzenle'}
                    </Text>
                  </Pressable>
                </Row>
                <Text variant="caption" color="textSecondary">
                  Tarih ve tutarları değiştirmek için Düzenle’ye basın; anahtarı açtığınız vadeler ödendi kaydedilir.
                </Text>
              </Stack>

              {showInterestField ? (
                <Stack gap="xs">
                  <FieldGroup>
                    <TextField
                      label="Aylık faiz oranı % (isteğe bağlı)"
                      placeholder="2,5"
                      keyboardType="decimal-pad"
                      value={interestRateStr}
                      onChangeText={setInterestRateStr}
                    />
                  </FieldGroup>
                  <Text variant="caption" color="textSecondary">
                    {isCashAdvanceType
                      ? 'Taksitler azalan bakiye üzerinden hesaplanır; faiz değişince plan yeniden oluşur ve elle yaptığınız düzenlemeler sıfırlanır.'
                      : 'Anapara üzerinden azalan bakiyeyle hesaplanır; faiz değişince plan yeniden oluşur ve elle yaptığınız düzenlemeler sıfırlanır.'}
                  </Text>
                </Stack>
              ) : null}

              <Group inset={16}>
                {pageItems.map((item) => (
                  <PlanEditRow
                    key={item.installmentNumber}
                    item={item}
                    precision={valueUnit.precision}
                    currencyCode={valueUnitCode}
                    paid={isPreviewPaid(item)}
                    editing={editingPlan}
                    dateStr={planEdits[item.installmentNumber]?.dueDate ?? item.dueDate}
                    amountStr={
                      planEdits[item.installmentNumber]?.amountStr ??
                      formatAmountInput(
                        (item.amountMinor / 10 ** valueUnit.precision).toFixed(valueUnit.precision).replace('.', ','),
                        valueUnit.precision
                      )
                    }
                    onDateChange={(value) => editPlanItem(item.installmentNumber, { dueDate: value })}
                    onAmountChange={(value) => editPlanItem(item.installmentNumber, { amountStr: value })}
                    onTogglePaid={(value) => togglePreviewPaid(item.installmentNumber, value)}
                  />
                ))}
              </Group>

              <Pagination page={page} totalPages={totalPages} onChange={setPlanPage} />

              {paidPreviewCount > 0 ? (
                <Text variant="caption" style={{ color: theme.colors.success }}>
                  {paidPreviewCount} {periodLabels.unit.toLocaleLowerCase('tr-TR')} ödendi olarak kaydedilecek. Bu ödemeler
                  geçmiş tarihli işlenir ve hesap bakiyelerinizi değiştirmez.
                </Text>
              ) : null}

              {saveMutation.error ? (
                <Text variant="caption" color="danger">
                  {saveMutation.error instanceof Error ? saveMutation.error.message : 'Kayıt kaydedilemedi'}
                </Text>
              ) : null}

              <Button label="Kaydet" onPress={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!canSubmit} />
            </Stack>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard }}>
          <Stack gap="lg">
            <ScreenHeader
              inline
              title={isEditing ? 'Düzenle' : 'Yeni kayıt'}
              leftLabel={{ label: 'Vazgeç', onPress: () => router.back() }}
            />

            {!isEditing ? (
              <ScanPromptBanner description="Çek, senet, fatura veya kredi belgesini tara; tür, tutar ve vade otomatik dolsun." />
            ) : null}

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

            <FieldGroup>
              {isEditing || isLendingType ? (
                // docs/01-finansal-kayit-modeli.md §3.5 — birim kayıt oluşturulduktan sonra
                // değiştirilemez (isEditing); ödünç vermede ise aşağıdaki KAYNAK HESAP'ın
                // biriminden türetilir — o hesapta ne varsa onunla ödünç verilir, ayrıca
                // seçilmez. İkisinde de burada yalnızca bilgi amaçlı gösterilir.
                <FormRow
                  label="Değer birimi"
                  value={
                    isLendingType && !accountId
                      ? 'Aşağıdan kaynak hesap seçin'
                      : (VALUE_UNIT_LABEL[valueUnitCode] ?? valueUnitCode)
                  }
                />
              ) : (
                <ValueUnitPicker label="Değer birimi" selectedId={valueUnitCode} onSelect={setValueUnitCode} />
              )}
              <DocumentTypePicker
                label="Belge türü"
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
                  // Ödünç verme her zaman bir alacaktır (kişi size borçlanır) — yön otomatik
                  // kilitlenir. HESAP yalnızca gerçek bakiyesi olan (kasa/banka) hesaplardan
                  // seçilebilir; geçersiz kalan bir seçim varsa temizlenir.
                  if (value === LENDING_DOCUMENT_TYPE) {
                    setDirection('receivable');
                    if (!lendingSourceAccounts.some((a) => a.id === accountId)) setAccountId(null);
                  }
                }}
              />
              <TextField label="Başlık" placeholder="Örn. Ocak ayı kira çeki" value={title} onChangeText={setTitle} />
              {isPlanEditing ? (
                <FormRow
                  label="Tutar"
                  value={`${formatValueUnitAmount(planTotalMinor, valueUnitCode)} — taksit planının toplamı`}
                />
              ) : (
                <AmountField
                  label={
                    isPerInstallmentMode
                      ? `${periodLabels.unitTitle} başına tutar (${valueUnit.quantityLabel})`
                      : `Tutar (${valueUnit.quantityLabel})`
                  }
                  placeholder={valueUnit.precision === 0 ? '1' : '0,00'}
                  precision={valueUnit.precision}
                  value={totalAmount}
                  onChangeText={setTotalAmount}
                />
              )}
              {isPlanEditing ? null : (
                <DateField
                  label={!isEditing && installmentCount > 1 ? 'İlk vade' : 'Vade'}
                  value={dueDate}
                  onChangeText={setDueDate}
                />
              )}
            </FieldGroup>

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

            <FieldGroup>
              {isLoanType || isSubscriptionType || isCashAdvanceType || isCardStatementType ? null : activeWorkspaceId ? (
                <CounterpartyPicker
                  label={isSalaryType ? 'Personel' : 'Kişi / firma'}
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
              {documentType && BANK_DOCUMENT_TYPES.has(documentType) ? (
                <BankPicker
                  label="Banka"
                  placeholder={isLoanType ? 'Banka seçin' : 'Banka seçin (isteğe bağlı)'}
                  selectedId={bankCode}
                  onSelect={setBankCode}
                />
              ) : null}
              {isSubscriptionType ? (
                <ServicePicker label="Servis" placeholder="Servis seçin (isteğe bağlı)" selectedId={serviceCode} onSelect={setServiceCode} />
              ) : null}
              {(categoriesQuery.data ?? []).length === 0 ? (
                <FormRow label="Kategori" value="Bu türde kategori bulunamadı." />
              ) : (
                <CategoryPicker
                  label="Kategori"
                  placeholder="Kategori seçin (isteğe bağlı)"
                  categories={categoriesQuery.data ?? []}
                  selectedId={categoryId}
                  onSelect={setCategoryId}
                />
              )}
              {detailAccounts.length === 0 ? (
                <FormRow
                  label={accountRowLabel}
                  value={
                    isLendingType
                      ? "Önce Hesaplar'dan bir kasa/banka hesabı ekleyin."
                      : isCashAdvanceType || isCardStatementType
                        ? "Önce Hesaplar'dan bir kredi kartı ekleyin."
                        : "Önce Hesaplar'dan bir hesap ekleyin."
                  }
                />
              ) : (
                <AccountPicker
                  label={accountRowLabel}
                  placeholder={isLendingType ? 'Kaynak hesap seçin' : isCashAdvanceType || isCardStatementType ? 'Kredi kartı seçin' : 'Hesap seçin (isteğe bağlı)'}
                  accounts={detailAccounts}
                  selectedId={accountId}
                  onSelect={(value) => {
                    setAccountId(value);
                    if (isLendingType) {
                      const selected = lendingSourceAccounts.find((a) => a.id === value);
                      if (selected) setValueUnitCode(selected.currency_code);
                    }
                  }}
                />
              )}
            </FieldGroup>

            {isLendingType ? (
              <Text variant="caption" color="textSecondary" style={{ paddingHorizontal: theme.spacing.md }}>
                Ödünç verilen tutar kaynak hesaptan düşülür.
              </Text>
            ) : null}

            {/* Çek/senet çoğunlukla bir faturanın karşılığıdır. Burada açılan çek/senet bağımsız bir
                kayıttır ve faturayı kapatmaz — fatura açık kalırsa aynı borç iki kez görünür
                (30.000 fatura + 20.000 çek = 50.000). Karşılığı olan çek/senet Ödeme Yap /
                Tahsilat Al'dan girilir (bkz. app/payments/new.tsx). */}
            {!isEditing && (documentType === 'cek' || documentType === 'senet') ? (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.replace({
                    pathname: '/payments/new',
                    params: {
                      direction,
                      method: documentType,
                      ...(counterpartyId ? { counterpartyId } : {}),
                    },
                  })
                }
              >
                <Card>
                  <Row gap="sm" align="center">
                    <Stack gap="xxs" style={{ flex: 1 }}>
                      <Text variant="cardTitle">
                        Bu {documentType === 'cek' ? 'çek' : 'senet'} bir faturanın karşılığı mı?
                      </Text>
                      <Text variant="caption" color="textSecondary">
                        {direction === 'receivable' ? 'Tahsilat Al' : 'Ödeme Yap'} ile kaydedin; fatura bu tutar
                        kadar kapanır, borç iki kez görünmez.
                      </Text>
                    </Stack>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textPrimary} />
                  </Row>
                </Card>
              </Pressable>
            ) : null}

            {isSubscriptionType ? (
              <Stack gap="sm">
                <Text variant="label" color="textSecondary">
                  YENİLEME
                </Text>
                <SegmentedControl
                  stretch
                  options={[
                    { key: 'monthly', label: 'Aylık' },
                    { key: 'yearly', label: 'Yıllık' },
                  ]}
                  value={billingPeriod}
                  onChange={setBillingPeriod}
                />
                <DateField label="DENEME BİTİŞ TARİHİ (İSTEĞE BAĞLI)" value={trialEndsOn} onChangeText={setTrialEndsOn} />
              </Stack>
            ) : null}

            {isCashAdvanceType && !isEditing ? (
              <Stack gap="sm">
                <Text variant="label" color="textSecondary">
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

            {saveMutation.error ? (
              <Text variant="caption" color="danger">
                {saveMutation.error instanceof Error ? saveMutation.error.message : 'Kayıt kaydedilemedi'}
              </Text>
            ) : null}

            <Button
              label={needsPlanStep ? 'Devam' : isEditing ? 'Güncelle' : 'Kaydet'}
              onPress={() => (needsPlanStep ? setStep(2) : saveMutation.mutate())}
              loading={!needsPlanStep && saveMutation.isPending}
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
      <Text variant="label" color="textSecondary">
        TAKSİT PLANI
      </Text>

      <Stack gap="sm">
        <Text variant="label" color="textSecondary">
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
          <Ionicons name="add-circle-outline" size={18} color={theme.colors.textPrimary} />
          <Text variant="body" style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>
            {unitLabel} Ekle
          </Text>
        </Row>
      </Pressable>

      {/* Planı uzat: sözleşme yenilendiğinde (maaş zammı, kira artışı) plana tek seferde
          N vade eklemek için. Tutar boş bırakılırsa son vadenin tutarı sürer. */}
      <Card>
        <Stack gap="sm">
          <Text variant="label" color="textSecondary">
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

const PLAN_PAGE_SIZE = 10;
const planDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });

// 2. adım satırı: özet (başlık, tarih · tutar) + küçük ödendi anahtarı. Sayfadaki "Düzenle"
// açıkken satır 1. adımdaki alan stiliyle (etiket üstte) tarih ve tutar alanlarına dönüşür.
function PlanEditRow({
  item,
  dateStr,
  amountStr,
  precision,
  currencyCode,
  paid,
  editing,
  onDateChange,
  onAmountChange,
  onTogglePaid,
}: {
  item: InstallmentPlanItem;
  dateStr: string;
  amountStr: string;
  precision: 0 | 2;
  currencyCode: string;
  paid: boolean;
  editing: boolean;
  onDateChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onTogglePaid: (value: boolean) => void;
}) {
  const due = new Date(`${item.dueDate}T00:00:00`);
  const summary = `${Number.isNaN(due.getTime()) ? item.dueDate : planDateFormatter.format(due)} · ${formatValueUnitAmount(item.amountMinor, currencyCode)}`;

  return (
    <View style={{ paddingVertical: 10, paddingHorizontal: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontWeight: '500' }}>{item.installmentNumber}. taksit</Text>
          {editing ? null : (
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {summary}
              {item.interestMinor > 0 ? ` · faiz ${formatMinorAmount(item.interestMinor)}` : ''}
            </Text>
          )}
        </View>
        {/* Küçültülmüş anahtar: ölçek yerleşimi etkilemesin diye sabit boyutlu kapta. */}
        <View style={{ width: 40, height: 26, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Switch
            accessibilityLabel={`${item.installmentNumber}. taksit ödendi`}
            value={paid}
            onValueChange={onTogglePaid}
            style={{ transform: [{ scale: 0.72 }] }}
          />
        </View>
      </View>
      {editing ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <FieldGroup>
              <DateField label="Vade" value={dateStr} onChangeText={onDateChange} />
            </FieldGroup>
          </View>
          <View style={{ flex: 1 }}>
            <FieldGroup>
              <AmountField label="Tutar" placeholder={precision === 0 ? '1' : '0,00'} precision={precision} value={amountStr} onChangeText={onAmountChange} />
            </FieldGroup>
          </View>
        </View>
      ) : null}
    </View>
  );
}
