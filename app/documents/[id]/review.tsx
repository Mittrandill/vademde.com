import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, InteractionManager, KeyboardAvoidingView, Modal, Platform, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { AmountField, BottomSheet, Button, Card, DateField, FieldGroup, FormRow, Pressable, Row, SegmentedControl, SourceTag, Stack, Text, TextField } from '@/components/primitives';
import { InstallmentPlanTable, type InstallmentPlanRow } from '@/components/finance/InstallmentPlanTable';
import { CategoryIcon } from '@/components/finance/CategoryIcon';
import { withAlpha } from '@/theme/colors';
import { CategoryPicker } from '@/components/finance/CategoryPicker';
import { AccountPicker } from '@/components/finance/AccountPicker';
import { CounterpartyPicker } from '@/components/finance/CounterpartyPicker';
import { DocumentTypePicker } from '@/components/finance/DocumentTypePicker';
import { BankPicker } from '@/components/finance/BankPicker';
import {
  discardDocument,
  getDocument,
  getDocumentFields,
  getDocumentLineItems,
  getDocumentWarnings,
  getSignedUrl,
  markDocumentConfirmed,
} from '@/features/documents/api';
import { createAccount, listAccounts } from '@/features/accounts/api';
import { listCategories, createCategory } from '@/features/categories/api';
import { listCounterparties, createCounterparty } from '@/features/counterparties/api';
import {
  ACTIVE_OBLIGATION_STATUSES,
  createObligation,
  createInstallmentPlan,
  listObligations,
  type Installment,
  localIsoDate,
} from '@/features/obligations/api';
import {
  allocateAcrossObligations,
  recordPastInstallmentPayments,
  settleWithInstrument,
} from '@/features/payments/api';
import {
  createTransaction,
  createTransactions,
  listCardStatementMatchCandidates,
} from '@/features/transactions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatAmountInput, formatMinorAmount, parseAmountToMinor } from '@/utils/money';
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABEL,
  DOCUMENT_TYPE_ICON,
  BANK_DOCUMENT_TYPES,
  COUNTERPARTY_LESS_DOCUMENT_TYPES,
} from '@/features/obligations/documentTypes';
import { resolveBankFromDocument } from '@/features/banks/banks';
import { VALUE_UNITS, getValueUnit } from '@/features/valueUnits/units';
import { queryKeys, invalidatePaymentRelatedQueries } from '@/services/queryKeys';
import { syncObligationReminder } from '@/services/notifications';
import { syncCreditCardStatementReminder } from '@/services/creditCardReminders';
import { showSaveSuccess, showErrorAlert } from '@/utils/alerts';
import {
  cardLineLabel,
  isCardExpenseLine,
  isCardStatementLine,
  matchStatementLines,
  statementMatchDateRange,
} from '@/utils/cardStatement';

type Direction = 'payable' | 'receivable' | 'income' | 'expense';

// Bu türler her zaman vadelidir (ödendi/gider seçeneği gösterilmez).
const ALWAYS_SCHEDULED_TYPES = new Set(['cek', 'senet', 'kredi', 'kredi_karti_ekstresi', 'nakit_avans']);

const LOW_CONFIDENCE_THRESHOLD = 0.7;

// OCR taradığı belgeler (çek/senet/fatura/kredi/ekstre) her zaman fiat para birimindedir —
// kıymetli maden (gram altın vb.) OCR şemasında modellenmiyor (bkz. docs/04-ocr-belge-isleme.md).
// Seçenekler bu yüzden VALUE_UNITS'in tamamı yerine yalnızca fiat birimlerle sınırlıdır; bu
// sayede hassasiyet (precision) her zaman 2 kalır ve dosyadaki mevcut parseAmountToMinor
// (fiat-only, /100) çağrıları değişmeden doğru sonuç üretmeye devam eder.
const CURRENCY_OPTIONS = VALUE_UNITS.filter((u) => u.unitType === 'fiat').map((u) => ({ key: u.code, label: u.code }));
const CURRENCY_CODES = new Set(CURRENCY_OPTIONS.map((o) => o.key));

// Türkçe ticari unvan eklerini (A.Ş., LTD, ŞTİ, TİC, SAN vb.) ve noktalama/boşluk
// farklarını yok sayarak karşılaştırılabilir hale getirir — "Migros Ticaret A.Ş." OCR
// metniyle kayıtlı "Migros" kişi/firmasını eşleştirebilmek için (bkz. docs/04-ocr-belge-isleme.md
// §6.6 "isim benzerliği", aşağıdaki kişi/firma eşleştirme efekti).
const LEGAL_SUFFIX_PATTERN =
  /\b(a\.?ş\.?|ltd\.?|şti\.?|limited|anonim|tic\.?|ticaret|san\.?|sanayi|paz\.?|pazarlama|co\.?|inc\.?)\b/g;

function normalizeCounterpartyName(name: string): string {
  return name
    .toLocaleLowerCase('tr-TR')
    .replace(/[.,]/g, ' ')
    .replace(LEGAL_SUFFIX_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// OCR'dan gelen tarihler her zaman geçerli ISO olmayabiliyor (model 'YYYY-AA-GG' yerine
// serbest metin döndürebilir, kullanıcı da alanı elle düzenleyebilir). new Date(bozuk)
// → Invalid Date → .toISOString() RangeError fırlatır ve onay akışının tamamını düşürürdü;
// burada geçersiz değer sessizce null'a çevrilir, çağıran tarafta bugüne düşülür.
function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function DocumentReviewScreen() {
  // accountId/documentType: hesap detayından "Ekstresi Ekle → Kameradan Tara" ile
  // gelindiğinde tara.tsx üzerinden taşınır (bkz. B2 notu). Kullanıcının açık niyeti
  // olduğu için aşağıdaki OCR tabanlı otomatik eşleştirmelerden (cardLastFourFromOcr)
  // önceliklidir.
  // expectedDueDate: kullanıcı hesap detayındaki ekstre tablosunda belirli bir geçmiş ayı
  // seçip oradan taradıysa (bkz. app/accounts/[id].tsx), o ayın beklenen son ödeme tarihi.
  // OCR hiç tarih bulamazsa yedek değer olarak kullanılır; OCR bir tarih bulduysa OCR'ın
  // okuduğu tarih önceliklidir (belge gerçek kaynaktır) — burası yalnızca ay uyuşmazsa
  // kullanıcıyı uyarmak için kıyaslanır (bkz. aşağıdaki dueDatePeriodMismatch).
  const {
    id,
    accountId: paramAccountId,
    documentType: paramDocumentType,
    expectedDueDate: paramExpectedDueDate,
  } = useLocalSearchParams<{
    id: string;
    accountId?: string;
    documentType?: string;
    expectedDueDate?: string;
  }>();
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const insets = useSafeAreaInsets();
  // Belge önizlemesine dokununca tam ekran görüntü.
  const [previewOpen, setPreviewOpen] = useState(false);
  // Ödeme planı tablosunda dokunulan taksit (vade, tutar, ödendi düzenleme sayfası).
  const [editingDraftIndex, setEditingDraftIndex] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [counterpartyResolved, setCounterpartyResolved] = useState(false);
  const [direction, setDirection] = useState<Direction>('payable');
  const [documentType, setDocumentType] = useState<string | null>(paramDocumentType ?? null);
  const [selectedBankCode, setSelectedBankCode] = useState<string | null>(null);
  const [extractedBankName, setExtractedBankName] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [valueUnitCode, setValueUnitCode] = useState('TRY');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  // Taranan çek/senet bir fatura/borcun karşılığıysa kapatılacak kayıtlar (bkz. aşağıdaki
  // settlementTargetsQuery). Seçilmezse çek/senet bağımsız yeni bir kayıt olarak açılır.
  const [settleTargetIds, setSettleTargetIds] = useState<string[]>([]);
  const [accountId, setAccountId] = useState<string | null>(paramAccountId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryAutoSet, setCategoryAutoSet] = useState(false);
  // Kredi dışındaki türlerde belgenin suggested_category_id'sini (bkz. process-document
  // — Gemini'nin suggestedCategory adını mevcut kategorilerle sunucu tarafında eşleştirir)
  // bir kez uygulamak için — aşağıdaki genel kategori efekti.
  const [suggestedCategoryApplied, setSuggestedCategoryApplied] = useState(false);
  // Kredi belgelerine özel: OCR'ın çıkardığı faiz oranı ve toplam geri ödeme (bilgi amaçlı,
  // taksit tablosu asıl kaynaktır) — bkz. supabase/functions/process-document installmentPlan şeması.
  const [interestRatePercent, setInterestRatePercent] = useState('');
  const [ocrTotalRepaymentMinor, setOcrTotalRepaymentMinor] = useState<number | null>(null);
  // Kredi kartı ekstresi için: OCR'ın okuduğu son 4 hane ile mevcut kredi kartı hesapları
  // arasında otomatik eşleştirme (docs/04-ocr-belge-isleme.md §7.4). Eşleşme bulunamazsa
  // kullanıcı AccountPicker'dan elle seçer — form akışı bozulmaz.
  const [cardLastFourFromOcr, setCardLastFourFromOcr] = useState<string | null>(null);
  // Kartın kesim tarihi (statement_day türetmek için) — yalnızca yeni kart hızlı-ekleme
  // önerisinde kullanılır, forma yazılmaz.
  const [cardStatementDateFromOcr, setCardStatementDateFromOcr] = useState<string | null>(null);
  // paramAccountId zaten accountId'yi doldurduysa aşağıdaki eşleştirme useEffect'i onu
  // hiç çalıştırmıyor (kontrolü !accountId); burada true başlatmak yalnızca niyeti
  // açık kılar, davranışı değiştirmez.
  const [cardAccountMatchAttempted, setCardAccountMatchAttempted] = useState(!!paramAccountId);
  // OCR'ın okuduğu ödeme yöntemi (bkz. process-document extractedSummary.paymentMethod)
  // "nakit" ise ve kayıtlı bir Nakit/Kasa hesabı varsa aynı desenle (yukarıdaki
  // cardAccountMatchAttempted gibi) yalnızca bir kez otomatik seçilir.
  const [cashAccountMatchAttempted, setCashAccountMatchAttempted] = useState(!!paramAccountId);
  // Eşleşme bulunamayan (kayıtsız) kart için "kayıtlı kartlara eklensin mi?" sorusu
  // kullanıcıya yalnızca bir kez sorulur.
  const [cardQuickAddOffered, setCardQuickAddOffered] = useState(false);
  // "Sadece toplam borç" ile "harcamaları kategorilere ayır" arasındaki seçim — ikincisinde
  // her ekstre satırı karta ayrı bir (geçmiş tarihli) gider hareketi olarak işlenir. Ekstre
  // taramanın asıl amacı harcamaları görmek olduğundan varsayılan "kategorilere ayır"dır;
  // önceden varsayılan "toplam borç"tu ve seçim kolayca gözden kaçıp yalnızca tek bir kart
  // borcu kaydı oluşuyordu.
  const [categorizeCardSpending, setCategorizeCardSpending] = useState(true);
  const [cardTransactionCategoryById, setCardTransactionCategoryById] = useState<Record<string, string | null>>({});
  // OCR'ın satır bazlı kategori önerileri (document_line_items.suggested_category_id) bir kez
  // taslağa kopyalanır; sonrasında kullanıcının seçimi esastır.
  const [cardCategoriesInitialized, setCardCategoriesInitialized] = useState(false);
  const [cardMatchOverrides, setCardMatchOverrides] = useState<Record<string, 'import' | 'skip'>>({});
  // Taksit tablosu satırları (vade + tutar + ödendi durumu) kullanıcı tarafından tek tek
  // düzenlenebilir; OCR'ın döndürdüğü document_line_items'tan bir kez taslak olarak kopyalanır.
  const [installmentDrafts, setInstallmentDrafts] = useState<
    { id: string; sortOrder: number; dueDate: string; amount: string; paid: boolean }[]
  >([]);
  const [installmentsInitialized, setInstallmentsInitialized] = useState(false);

  const documentQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.document(activeWorkspaceId, id as string) : ['document', 'disabled'],
    queryFn: () => getDocument(id as string),
    enabled: !!id && !!activeWorkspaceId,
  });

  const fieldsQuery = useQuery({
    queryKey: ['document', id, 'fields'],
    queryFn: () => getDocumentFields(id as string),
    enabled: !!id,
  });

  const lineItemsQuery = useQuery({
    queryKey: ['document', id, 'line-items'],
    queryFn: () => getDocumentLineItems(id as string),
    enabled: !!id,
  });

  const warningsQuery = useQuery({
    queryKey: ['document', id, 'warnings'],
    queryFn: () => getDocumentWarnings(id as string),
    enabled: !!id,
  });
  const installmentItems = (lineItemsQuery.data ?? []).filter((item) => item.kind === 'installment');
  const cardTransactionItems = useMemo(
    () => (lineItemsQuery.data ?? []).filter(isCardStatementLine),
    [lineItemsQuery.data]
  );
  const cardExpenseItems = useMemo(() => cardTransactionItems.filter(isCardExpenseLine), [cardTransactionItems]);
  const cardOtherItems = useMemo(
    () => cardTransactionItems.filter((item) => !isCardExpenseLine(item)),
    [cardTransactionItems]
  );
  const statementMatchRange = useMemo(() => statementMatchDateRange(cardExpenseItems), [cardExpenseItems]);
  // Ekstre harcamaları karta ayrı hareketler olarak işlenecek mi? Harcama satırı hiç yoksa
  // (yalnızca ödeme/iade okunduysa) seçim etkisizdir — toplam borç tek kayıt olarak kalır.
  const splitsCardSpending =
    documentType === 'kredi_karti_ekstresi' && categorizeCardSpending && cardExpenseItems.length > 0;

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const statementCandidatesQuery = useQuery({
    queryKey: [
      activeWorkspaceId,
      'statement-match-candidates',
      accountId,
      statementMatchRange,
      cardExpenseItems.map((item) => item.amount_minor),
    ],
    queryFn: () =>
      listCardStatementMatchCandidates({
        workspaceId: activeWorkspaceId as string,
        accountId: accountId as string,
        fromDate: statementMatchRange!.fromDate,
        toDate: statementMatchRange!.toDate,
        amountsMinor: cardExpenseItems.map((item) => item.amount_minor),
      }),
    enabled:
      splitsCardSpending &&
      !!activeWorkspaceId &&
      !!accountId &&
      !!statementMatchRange,
  });
  const cardMatches = useMemo(
    () => matchStatementLines(cardExpenseItems, statementCandidatesQuery.data ?? []),
    [cardExpenseItems, statementCandidatesQuery.data]
  );
  const shouldSkipMatchedItem = (itemId: string) => {
    const override = cardMatchOverrides[itemId];
    if (override) return override === 'skip';
    return cardMatches.get(itemId)?.confidence === 'high';
  };
  const cardItemsToImport = cardExpenseItems.filter((item) => !shouldSkipMatchedItem(item.id));

  const categoryKind = direction === 'payable' || direction === 'expense' ? 'expense' : 'income';
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

  // OCR sonucu ilk geldiğinde formu doldur (yalnızca bir kez).
  useEffect(() => {
    const document = documentQuery.data;
    if (!document || initialized) return;

    setDirection((document.direction as Direction) ?? 'payable');
    // Kullanıcı "Ekstresi Ekle" ile geldiyse niyeti bellidir — OCR belgeyi yanlış
    // sınıflandırsa bile (ör. "banka_dekontu" tahmin etse) paramDocumentType kazanır.
    // Kullanıcı yine de DocumentTypePicker'dan değiştirebilir.
    setDocumentType(paramDocumentType ?? document.document_type);
    // Gemini'nin çıkardığı para birimi (financial_documents.currency_code) daha önce hiç
    // okunmuyordu — kayıt her zaman sessizce TRY olarak oluşuyordu. Tanınmayan/boş bir kod
    // gelirse (serbest metin çıktısı) TRY'ye düşülür; kullanıcı yine de PARA BİRİMİ alanından
    // düzeltebilir (bkz. aşağıdaki LowConfidenceHint fieldName="currency").
    setValueUnitCode(document.currency_code && CURRENCY_CODES.has(document.currency_code) ? document.currency_code : 'TRY');
    setAmount(
      document.total_amount_minor ? formatAmountInput((document.total_amount_minor / 100).toFixed(2).replace('.', ',')) : ''
    );
    // OCR bir tarih bulduysa (belge gerçek kaynaktır) o kullanılır; hiç bulamadıysa
    // kullanıcının ekstre tablosundan seçtiği ayın beklenen tarihine düşülür — böylece
    // alan hiç boş/bugünün tarihi kalmaz (bkz. yukarıdaki paramExpectedDueDate notu).
    setDueDate(document.due_date ?? document.issue_date ?? paramExpectedDueDate ?? '');
    setDocumentNumber(document.document_number ?? '');

    // Kredi/kredi kartı ekstresi için Gemini'nin çıkardığı banka adını statik banka
    // listesiyle eşleştirip BankPicker'ı önceden doldur (kullanıcı yine değiştirebilir).
    // Eşleşme bulunamazsa ham ad, banka logosu yerine baş harfli avatar göstermek için saklanır.
    // Banka eşleştirmesi daha önce yalnızca kredi ve kredi kartı ekstresinde çalışıyordu;
    // çekte de bir düzenleyen banka vardır (BANK_DOCUMENT_TYPES) ve BANKA alanı gösterilir —
    // orada alan her zaman boş açılıyordu.
    if (document.document_type && BANK_DOCUMENT_TYPES.has(document.document_type)) {
      const summary = document.extracted_summary as {
        loan?: {
          bankName?: string | null;
          totalRepaymentMinor?: number | null;
          interestRatePercent?: number | null;
        };
        card?: { bankName?: string | null; cardLastFourDigits?: string | null; statementDate?: string | null };
      } | null;
      // Gemini prompt'u installmentPlan/cardStatement.bankName alanını doldurmayı her zaman
      // garanti etmiyor, ama bu iki türde "kişi/firma" olarak okunan counterparty_name aslında
      // zaten bankanın adıdır (bkz. aşağıdaki COUNTERPARTY_LESS_DOCUMENT_TYPES efekti) ve BAŞLIK
      // bunu her zaman kullanır (bkz. altdaki setTitle). Yapılandırılmış alan boşsa aynı isme
      // buradan da düşülür — aksi halde başlıkta görünen banka adı BANKA alanıyla eşleşmiyordu.
      const ocrBankName = summary?.loan?.bankName ?? summary?.card?.bankName ?? document.counterparty_name ?? null;
      setExtractedBankName(ocrBankName);

      if (summary?.card?.cardLastFourDigits) setCardLastFourFromOcr(summary.card.cardLastFourDigits);
      if (summary?.card?.statementDate) setCardStatementDateFromOcr(summary.card.statementDate);

      if (document.document_type === 'kredi') {
        if (summary?.loan?.interestRatePercent != null) {
          setInterestRatePercent(String(summary.loan.interestRatePercent).replace('.', ','));
        }
        setOcrTotalRepaymentMinor(summary?.loan?.totalRepaymentMinor ?? null);
      }
    }
    setTitle(
      document.counterparty_name
        ? `${DOCUMENT_TYPE_LABEL[document.document_type ?? ''] ?? 'Belge'} — ${document.counterparty_name}`
        : (DOCUMENT_TYPE_LABEL[document.document_type ?? ''] ?? 'Yeni Belge')
    );
    setInitialized(true);

    setImageUrl(null);
    if (document.retain_original === true) {
      getSignedUrl(document.storage_path)
        .then(setImageUrl)
        .catch(() => {});
    }
  }, [documentQuery.data, initialized]);

  // Banka, efektle state'e yazılmak yerine TÜRETİLİR. Nedeni: en güvenilir sinyal olan
  // IBAN, belge kaydından değil ayrı bir sorgudan (document_fields) gelir ve genelde bir
  // tik sonra hazır olur — "yalnızca bir kez" çalışan form doldurma efektine bağlansaydı
  // IBAN o an henüz yok olduğu için hiç kullanılamazdı. Türetilmiş değer, alanlar geldiği
  // anda kendiliğinden doğrulanır ve efekt içinde setState gerekmez.
  //
  // Sinyaller güvenilirlik sırasıyla denenir (bkz. features/banks/banks.ts
  // resolveBankFromDocument): IBAN -> OCR'ın çıkardığı banka adı -> alanların ham metni.
  const autoBankCode = useMemo(() => {
    const document = documentQuery.data;
    if (!document?.document_type || !BANK_DOCUMENT_TYPES.has(document.document_type)) return null;
    const ocrFields = fieldsQuery.data ?? [];
    const ibanField = ocrFields.find((field) => /iban/i.test(field.field_name));
    return resolveBankFromDocument({
      bankName: extractedBankName,
      iban: ibanField?.normalized_value ?? ibanField?.raw_value ?? null,
      rawText: ocrFields.map((f) => `${f.raw_value ?? ''} ${f.normalized_value ?? ''}`).join(' '),
    });
  }, [documentQuery.data, fieldsQuery.data, extractedBankName]);

  // Kullanıcı BANKA alanını elle seçtiyse onun seçimi kazanır; seçmediyse OCR'dan türetilen
  // banka kullanılır.
  const bankCode = selectedBankCode ?? autoBankCode;

  // docs/04-ocr-belge-isleme.md §6.6 — isim benzerliğiyle kişi/firma eşleştirme. Yalnızca
  // mevcut bir kayıtla TEK ve belirsiz olmayan bir eşleşme varsa önceden seçilir (DB'ye
  // hiçbir şey yazmaz). Eşleşme yoksa artık burada otomatik yeni kişi/firma OLUŞTURULMAZ —
  // önceden bu efekt ekran açılır açılmaz (belge hiç onaylanmasa/silinse bile)
  // createCounterparty çağırıyordu ve sahipsiz kayıtlar birikiyordu. Eşleşme bulunamayan
  // durumda kullanıcı aşağıdaki CounterpartyPicker'dan (mevcut bir kayıtla eşleştirme veya
  // "yeni oluştur") elle seçer; hiç seçmezse yeni kayıt yalnızca belge onaylanırken
  // (confirmMutation) açılır.
  // Kredi ve kredi kartı ekstresinde OCR'ın "kişi/firma" olarak okuduğu isim aslında
  // bankadır — bu ikisinde banka kimliği zaten bank_code/logo üzerinden temsil edildiğinden
  // ayrıca bir kişi/firma eşleştirmesi denenmez.
  useEffect(() => {
    const document = documentQuery.data;
    if (!document?.counterparty_name || !counterpartiesQuery.isSuccess || counterpartyResolved) {
      return;
    }
    if (document.document_type && COUNTERPARTY_LESS_DOCUMENT_TYPES.has(document.document_type)) {
      setCounterpartyResolved(true);
      return;
    }
    setCounterpartyResolved(true);

    const normalizedTarget = normalizeCounterpartyName(document.counterparty_name);
    if (!normalizedTarget) return;
    // Önce tam (unvan eki/noktalama farkı yok sayılarak) eşleşme aranır; yoksa "Migros
    // Ticaret A.Ş." OCR'ı ile kayıtlı "Migros" gibi bir kısmi/benzer eşleşme denenir — ama
    // yalnızca TEK bir aday varsa otomatik seçilir; birden fazla belirsiz aday varsa yanlış
    // birleştirme riskine girmemek için hiçbiri seçilmez, kullanıcı elle seçer.
    const exact = counterpartiesQuery.data.find(
      (c) => normalizeCounterpartyName(c.name) === normalizedTarget
    );
    if (exact) {
      setCounterpartyId(exact.id);
      return;
    }
    if (normalizedTarget.length < 3) return;
    const similar = counterpartiesQuery.data.filter((c) => {
      const normalizedName = normalizeCounterpartyName(c.name);
      return normalizedName.length >= 3 && (normalizedName.includes(normalizedTarget) || normalizedTarget.includes(normalizedName));
    });
    if (similar.length === 1) setCounterpartyId(similar[0]!.id);
  }, [documentQuery.data, counterpartiesQuery.isSuccess, counterpartiesQuery.data, counterpartyResolved]);

  // Kredi kartı ekstresi son 4 hane ↔ mevcut kredi kartı hesabı eşleştirmesi (bkz. yukarıdaki
  // banka adı eşleştirmesiyle aynı desen). accountsQuery, documentQuery'den sonra da
  // dolabileceğinden ayrı bir efekt olarak, ikisi de hazır olduğunda bir kez çalışır.
  useEffect(() => {
    if (cardAccountMatchAttempted || !cardLastFourFromOcr || !accountsQuery.isSuccess || accountId) return;
    setCardAccountMatchAttempted(true);
    const matches = accountsQuery.data.filter(
      (a) =>
        a.type === 'credit_card' &&
        a.card_last_four === cardLastFourFromOcr &&
        (!bankCode || !a.bank_code || a.bank_code === bankCode)
    );
    if (matches.length === 1) setAccountId(matches[0]!.id);
  }, [cardAccountMatchAttempted, cardLastFourFromOcr, accountsQuery.isSuccess, accountsQuery.data, accountId, bankCode]);

  // OCR "nakit" ödeme okuduysa (bkz. process-document PROMPT'taki paymentMethod kuralı) ve
  // kullanıcı/parametre henüz bir hesap seçmediyse, kayıtlı TEK bir Nakit/Kasa hesabı varsa
  // önceden seçilir — birden fazla nakit hesap varsa (ör. "Cüzdan" + "İşyeri Kasası")
  // hangisinin doğru olduğu belirsiz olduğundan hiçbiri otomatik seçilmez, kullanıcı elle
  // seçer. Kredi kartı ekstresi zaten kendi son-dört-hane eşleştirmesine sahiptir (yukarıda),
  // burada dışlanır.
  useEffect(() => {
    if (
      cashAccountMatchAttempted ||
      accountId ||
      !accountsQuery.isSuccess ||
      !documentQuery.isSuccess ||
      documentType === 'kredi_karti_ekstresi'
    ) {
      return;
    }
    setCashAccountMatchAttempted(true);
    const summary = documentQuery.data.extracted_summary as { paymentMethod?: string | null } | null;
    if (summary?.paymentMethod !== 'nakit') return;
    const cashAccounts = accountsQuery.data.filter((a) => a.type === 'cash');
    if (cashAccounts.length === 1) setAccountId(cashAccounts[0]!.id);
  }, [
    cashAccountMatchAttempted,
    accountId,
    accountsQuery.isSuccess,
    accountsQuery.data,
    documentQuery.isSuccess,
    documentQuery.data,
    documentType,
  ]);

  // Eşleşme denendi ama kart kayıtlı hesaplarda yoktu: kullanıcıya kayıtlı kartlara
  // eklemek isteyip istemediği sorulur (aksi halde HESAP alanında hiçbir seçenek
  // görünmez, kullanıcı önce Hesaplar'a gidip kartı elle eklemek zorunda kalırdı).
  // statement_day/payment_due_day OCR'dan türetilebiliyorsa doldurulur ki ekstre
  // yükleme hatırlatması (syncCreditCardStatementReminder) da otomatik kurulsun;
  // credit_limit gibi OCR'da olmayan alanlar kullanıcı tarafından Hesaplar'dan
  // sonradan tamamlanır.
  const quickAddCardMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !cardLastFourFromOcr) throw new Error('Kart bilgisi eksik');
      const statementDay = cardStatementDateFromOcr ? Number(cardStatementDateFromOcr.slice(8, 10)) : NaN;
      const paymentDueDay = dueDate ? Number(dueDate.slice(8, 10)) : NaN;
      const account = await createAccount({
        workspace_id: activeWorkspaceId,
        name: extractedBankName ? `${extractedBankName} Kredi Kartı` : `Kredi Kartı •••• ${cardLastFourFromOcr}`,
        type: 'credit_card',
        bank_code: bankCode,
        card_last_four: cardLastFourFromOcr,
        statement_day: statementDay >= 1 && statementDay <= 31 ? statementDay : null,
        payment_due_day: paymentDueDay >= 1 && paymentDueDay <= 31 ? paymentDueDay : null,
      });
      syncCreditCardStatementReminder(activeWorkspaceId, account).catch(() => {});
      return account;
    },
    onSuccess: (account) => {
      if (activeWorkspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts(activeWorkspaceId) });
      }
      setAccountId(account.id);
    },
    onError: (error) => showErrorAlert(error),
  });

  useEffect(() => {
    if (
      cardQuickAddOffered ||
      !cardAccountMatchAttempted ||
      accountId ||
      !cardLastFourFromOcr ||
      documentType !== 'kredi_karti_ekstresi'
    ) {
      return;
    }
    setCardQuickAddOffered(true);
    Alert.alert(
      'Kart Kayıtlı Değil',
      `•••• ${cardLastFourFromOcr}${extractedBankName ? ` (${extractedBankName})` : ''} numaralı kart kayıtlı hesaplarınızda bulunamadı. Kayıtlı kartlarınıza eklemek ister misiniz?`,
      [
        { text: 'Şimdi Değil', style: 'cancel' },
        { text: 'Kartı Ekle', onPress: () => quickAddCardMutation.mutate() },
      ]
    );
    // quickAddCardMutation kasıtlı olarak deps dışında bırakıldı (yukarıdaki not).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardQuickAddOffered, cardAccountMatchAttempted, accountId, cardLastFourFromOcr, documentType, extractedBankName]);

  // Ekstre satırlarının kategorilerini OCR önerisiyle (bkz. process-document — Gemini her
  // satırı işyeri adına göre workspace'in gider kategorilerinden birine atar) bir kez doldurur.
  // Öneri gelmeyen ücret/faiz satırları banka/kart ücreti kategorisine düşer. Kullanıcı her
  // satırı CategoryPicker'dan yine değiştirebilir — kesin kayıt onayla yazılır.
  useEffect(() => {
    if (
      cardCategoriesInitialized ||
      documentType !== 'kredi_karti_ekstresi' ||
      !lineItemsQuery.isSuccess ||
      !categoriesQuery.isSuccess
    ) {
      return;
    }
    setCardCategoriesInitialized(true);
    const categoryIds = new Set(categoriesQuery.data.map((c) => c.id));
    const feeCategory =
      categoriesQuery.data.find((c) => c.name === 'Banka & Kart Ücretleri') ??
      categoriesQuery.data.find((c) => c.name === 'Banka Masrafları') ??
      null;
    const initial: Record<string, string | null> = {};
    for (const item of lineItemsQuery.data.filter(isCardExpenseLine)) {
      if (item.suggested_category_id && categoryIds.has(item.suggested_category_id)) {
        initial[item.id] = item.suggested_category_id;
      } else if ((item.kind === 'card_fee' || item.kind === 'card_interest') && feeCategory) {
        initial[item.id] = feeCategory.id;
      }
    }
    setCardTransactionCategoryById((prev) => ({ ...initial, ...prev }));
  }, [
    cardCategoriesInitialized,
    documentType,
    lineItemsQuery.isSuccess,
    lineItemsQuery.data,
    categoriesQuery.isSuccess,
    categoriesQuery.data,
  ]);

  // Kredi taksit tablosunu (vade + tutar) düzenlenebilir taslağa bir kez kopyalar;
  // sonraki her düzenleme yalnızca yerel taslağı günceller, OCR verisini değil. Vadesi
  // bugünden önce olan taksitler gerçekte zaten ödenmiş olacağından "ödendi" ile başlar
  // (kullanıcı switch'le değiştirebilir) — bkz. confirmMutation, bu taksitler bir hesaba
  // bağlanmadan (bakiyeyi etkilemeden) ödenmiş olarak kaydedilir.
  useEffect(() => {
    if (installmentsInitialized || documentType !== 'kredi' || !lineItemsQuery.data) return;
    const items = lineItemsQuery.data.filter((item) => item.kind === 'installment');
    if (items.length === 0) return;
    const todayStr = localIsoDate();
    setInstallmentDrafts(
      items.map((item, index) => ({
        id: item.id,
        sortOrder: item.sort_order || index + 1,
        dueDate: item.occurred_at ?? '',
        amount: formatAmountInput((item.amount_minor / 100).toFixed(2).replace('.', ',')),
        paid: !!item.occurred_at && item.occurred_at < todayStr,
      }))
    );
    setInstallmentsInitialized(true);
  }, [installmentsInitialized, documentType, lineItemsQuery.data]);

  // docs/01-finansal-kayit-modeli.md — "Kredi... bir kategori değildir" kuralı document_type
  // için geçerlidir; category_id ayrı, raporlama amaçlı bir alandır. Kredi belgelerinde
  // kullanıcı adına manuel seçim gerekmesin diye "Kredi" kategorisi otomatik atanır
  // (yoksa bu workspace için bir kez oluşturulur), kullanıcı yine de değiştirebilir.
  useEffect(() => {
    if (categoryAutoSet || documentType !== 'kredi' || !activeWorkspaceId || !categoriesQuery.isSuccess) return;
    setCategoryAutoSet(true);

    const existing = categoriesQuery.data.find(
      (c) => c.name.trim().toLocaleLowerCase('tr-TR') === 'kredi'
    );
    if (existing) {
      setCategoryId(existing.id);
      return;
    }

    createCategory({
      workspace_id: activeWorkspaceId,
      name: 'Kredi',
      kind: categoryKind,
      icon: DOCUMENT_TYPE_ICON.kredi,
    })
      .then((created) => {
        setCategoryId(created.id);
        queryClient.invalidateQueries({ queryKey: queryKeys.categories(activeWorkspaceId, categoryKind) });
      })
      .catch(() => {});
  }, [categoryAutoSet, documentType, activeWorkspaceId, categoriesQuery.isSuccess, categoriesQuery.data, categoryKind, queryClient]);

  // Kredi dışındaki tüm belge türleri için: sunucu tarafında (process-document) Gemini'nin
  // suggestedCategory'siyle workspace'in mevcut kategorileri arasında zaten yapılmış eşleşme
  // (financial_documents.suggested_category_id) burada yalnızca önceden seçilir — kullanıcı
  // KategoriPicker'dan yine değiştirebilir. categoriesQuery direction'a göre (income/expense)
  // filtrelendiğinden, öneri yanlış yöndeyse (nadiren) listede bulunamaz ve sessizce atlanır.
  useEffect(() => {
    if (
      suggestedCategoryApplied ||
      categoryId ||
      documentType === 'kredi' ||
      !categoriesQuery.isSuccess ||
      !documentQuery.isSuccess
    ) {
      return;
    }
    setSuggestedCategoryApplied(true);
    const suggested = documentQuery.data.suggested_category_id;
    if (suggested && categoriesQuery.data.some((c) => c.id === suggested)) setCategoryId(suggested);
  }, [
    suggestedCategoryApplied,
    categoryId,
    documentType,
    categoriesQuery.isSuccess,
    categoriesQuery.data,
    documentQuery.isSuccess,
    documentQuery.data,
  ]);

  // Çek/senet ödeme aracıdır: müşteriden alınan ya da tedarikçiye verilen bir çek genellikle açık
  // bir faturanın karşılığıdır. Karşılığı seçilmeden kaydedilirse fatura açık kalır ve aynı borç
  // iki kez görünür (30.000 fatura + 20.000 çek = 50.000). Aynı kişi ve yöndeki açık kayıtlar
  // (çek/senet hariç) önerilir; seçilenler çek/senet tutarı kadar kapanır.
  const isInstrumentDocument = documentType === 'cek' || documentType === 'senet';
  const settlementTargetsQuery = useQuery({
    queryKey:
      activeWorkspaceId && counterpartyId && isInstrumentDocument
        ? [activeWorkspaceId, 'obligations', 'settlement-open', counterpartyId, direction]
        : ['settlement-open', 'disabled'],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        counterpartyId: counterpartyId as string,
        direction: direction as 'payable' | 'receivable',
        statuses: ACTIVE_OBLIGATION_STATUSES,
        pageSize: 100,
      }),
    enabled:
      !!activeWorkspaceId &&
      !!counterpartyId &&
      isInstrumentDocument &&
      (direction === 'payable' || direction === 'receivable'),
  });
  const settlementTargets = (settlementTargetsQuery.data ?? []).filter(
    (o) =>
      o.document_type !== 'cek' &&
      o.document_type !== 'senet' &&
      o.currency_code === valueUnitCode &&
      o.remaining_amount_minor > 0
  );

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId) throw new Error('Çalışma alanı bulunamadı');
      const amountMinor = parseAmountToMinor(amount);
      // Eskiden çözümlenemeyen tutar sessizce NaN olup kayda yazılıyordu; artık kullanıcıya
      // dönülür (docs/01-finansal-kayit-modeli.md §8.1 — tutarsız veri asla yazılmaz).
      if (amountMinor === null) throw new Error('Tutar okunamadı, kontrol edin');

      // Kullanıcı KİŞİ/FİRMA alanından mevcut bir kayıtla eşleştirmediyse (bkz.
      // CounterpartyPicker) ve OCR bir isim okuduysa, yeni kişi/firma kaydı ancak burada —
      // belge gerçekten onaylanırken — açılır. Önceden bu, ekran açılır açılmaz (belge hiç
      // onaylanmasa/silinse bile) otomatik oluşuyordu; artık kayıt yalnızca "Kaydet"
      // basıldığında yazılır.
      let resolvedCounterpartyId = counterpartyId;
      const rawCounterpartyName = documentQuery.data?.counterparty_name?.trim();
      const counterpartyEligible = !(documentType && COUNTERPARTY_LESS_DOCUMENT_TYPES.has(documentType));
      if (!resolvedCounterpartyId && counterpartyEligible && rawCounterpartyName) {
        const created = await createCounterparty({
          workspace_id: activeWorkspaceId,
          name: rawCounterpartyName,
          type: 'individual',
        });
        resolvedCounterpartyId = created.id;
        queryClient.invalidateQueries({ queryKey: queryKeys.counterparties(activeWorkspaceId) });
      }

      if (direction === 'payable' || direction === 'receivable') {
        if (!documentType) throw new Error('Belge türü seçin');
        if (splitsCardSpending && statementCandidatesQuery.isFetching) {
          throw new Error('Mükerrer hareket kontrolünün tamamlanmasını bekleyin');
        }
        if (splitsCardSpending && statementCandidatesQuery.isError) {
          throw new Error('Mevcut hareketler karşılaştırılamadı. Tekrar deneyin');
        }

        const hasInstallmentPlan = documentType === 'kredi' && installmentDrafts.length > 0;
        // Kullanıcının düzenlediği taksit taslakları (vade/tutar), OCR'ın orijinal
        // faiz/vergi kırılımıyla (tax_minor) birleştirilir — kullanıcı yalnızca tarih ve
        // toplam taksit tutarını değiştirir, anapara/faiz oranı bu farktan yeniden türetilir.
        const draftById = new Map(installmentDrafts.map((draft) => [draft.id, draft]));
        const mergedInstallments = hasInstallmentPlan
          ? installmentItems.map((item, index) => {
              const draft = draftById.get(item.id);
              const installmentAmountMinor =
                (draft ? parseAmountToMinor(draft.amount) : null) ?? item.amount_minor;
              const installmentDueDate =
                draft?.dueDate.trim() || item.occurred_at || dueDate || localIsoDate();
              return {
                installmentNumber: item.sort_order || index + 1,
                dueDate: installmentDueDate,
                amountMinor: installmentAmountMinor,
                principalMinor: installmentAmountMinor - (item.tax_minor ?? 0),
                interestMinor: item.tax_minor ?? 0,
                paid: draft?.paid ?? false,
              };
            })
          : [];
        // Taksit satırlarının tutarı (installmentAmountMinor) anapara + faiz + vergi
        // içerir; kredi anaparasıyla (TUTAR alanı) aynı şey değildir. Obligation'ın
        // toplamı taksitlerin toplamıyla birebir eşleşmeli — aksi halde kalan borç/
        // ilerleme hesapları (bkz. obligations/[id].tsx) taksitler tamamen ödendiğinde
        // bile "kalan borç" negatife düşer ya da sıfırlanmaz.
        const installmentsSumMinor = hasInstallmentPlan
          ? mergedInstallments.reduce((sum, item) => sum + item.amountMinor, 0)
          : null;
        // Kredi belgelerinde tekil bir "vade" alanı yerine her taksitin kendi vadesi
        // vardır; obligation'ın vadesi en yakın (ilk) taksitin tarihi olarak ayarlanır —
        // aksi halde due_date null kalıp aşağıdaki gibi ekranlarda kayıt tarihine
        // ("bugüne") düşer: app/(tabs)/hareketler.tsx `o.due_date ?? o.created_at`.
        const earliestInstallmentDueDate = hasInstallmentPlan
          ? mergedInstallments.reduce<string | null>(
              (earliest, item) => (!earliest || item.dueDate < earliest ? item.dueDate : earliest),
              null
            )
          : null;

        // Kredi kartı ekstresi her zaman TRY'dir (bkz. isCreditCardStatement); diğer
        // belge türlerinde kullanıcının PARA BİRİMİ alanından onayladığı/düzelttiği birim
        // kullanılır — önceden burası hiç gönderilmiyordu ve kayıt sessizce TRY oluyordu.
        const obligation = await createObligation({
          workspace_id: activeWorkspaceId,
          direction,
          document_type: documentType,
          title: title.trim() || 'Belge',
          total_amount_minor: installmentsSumMinor ?? amountMinor,
          currency_code: isCreditCardStatement ? 'TRY' : valueUnitCode,
          value_unit_type: getValueUnit(isCreditCardStatement ? 'TRY' : valueUnitCode).unitType,
          due_date: earliestInstallmentDueDate ?? dueDate ?? null,
          counterparty_id: resolvedCounterpartyId,
          account_id: accountId,
          // Harcamalar satır satır kategorize edildiyse kart borcunun kendisi kategorisizdir.
          category_id: splitsCardSpending ? null : categoryId,
          bank_code: BANK_DOCUMENT_TYPES.has(documentType) ? bankCode : null,
          notes: documentNumber.trim() ? `Belge no: ${documentNumber.trim()}` : null,
        });

        // docs/12-mvp-kabul-kriterleri.md — "Kredi ödeme planından taksitler ayrı satırlar olarak oluşturulur."
        let installmentPlanFailed = false;
        let createdInstallments: Installment[] = [];
        if (hasInstallmentPlan && installmentsSumMinor !== null) {
          try {
            createdInstallments = await createInstallmentPlan({
              workspaceId: activeWorkspaceId,
              obligationId: obligation.id,
              totalAmountMinor: installmentsSumMinor,
              installments: mergedInstallments,
            });
          } catch {
            // Tutarlar (yuvarlama vb. nedenlerle) tam uyuşmazsa taksit planı atlanır; borç
            // tek kalem olarak kalır ve kullanıcı sonradan manuel taksitlendirebilir — asla
            // tutarsız veri yazılmaz. Ama artık kullanıcıya bildirilir (docs/01 §8.1 —
            // "son taksit düzeltmesi veya kullanıcı onayı gerekir").
            installmentPlanFailed = true;
          }
        }

        // Vadesi geçmiş taksitler switch ile "ödendi" işaretlenmişse, hiçbir hesaba
        // bağlanmadan (bkz. recordPastInstallmentPayments — account_id null olduğu için
        // transaction oluşmaz) geçmiş tarihiyle ödenmiş kaydedilir: mevcut hesap
        // bakiyelerini etkilemez, sadece taksit/borç durumu "ödendi" olur. Tamamı tek
        // insert'te yazılır; taksit başına ayrı çağrı ekranı uzun süre kilitliyordu.
        if (!installmentPlanFailed && createdInstallments.length > 0) {
          const paidInstallmentNumbers = new Set(
            mergedInstallments.filter((item) => item.paid).map((item) => item.installmentNumber)
          );
          const paidRows = createdInstallments
            .filter((installment) => paidInstallmentNumbers.has(installment.installment_number))
            .map((installment) => ({
              workspace_id: activeWorkspaceId,
              obligation_id: obligation.id,
              installment_id: installment.id,
              amount_minor: installment.amount_minor,
              // due_date DB'den 'YYYY-MM-DD' olarak gelir; yine de bozuk bir değerde
              // new Date(...).toISOString() RangeError fırlatıp tüm onayı düşürmesin diye
              // geçerlilik kontrol edilir.
              paid_at: isoOrNull(installment.due_date) ?? new Date().toISOString(),
              notes: 'Otomatik: vadesi geçmiş taksit',
            }));
          try {
            await recordPastInstallmentPayments(paidRows);
          } catch {
            // Geçmiş ödeme kayıtları başarısız olsa bile borç/taksit planı oluşturulmuş
            // kalır; kullanıcı taksitleri obligation detayından manuel "ödendi" işaretleyebilir.
          }
        }

        // docs/04-ocr-belge-isleme.md §7.4 — kullanıcı yalnızca toplam kart borcunu veya
        // harcamaları da kategorilere ayırmayı seçebilir. Toplam borç zaten obligation
        // olarak oluşturuldu; "kategorilere ayır" seçiliyse her ekstre satırı ayrıca gider
        // işlemi olarak kaydedilir (kategori kırılımı raporları bu şekilde beslenir).
        // İkisi bilinçli olarak birbirinden bağımsızdır — bkz. plan kararı #3.
        let cardTransactionsFailed = false;
        if (splitsCardSpending && accountId) {
          try {
            await createTransactions(
              cardItemsToImport.map((item) => ({
                workspace_id: activeWorkspaceId,
                account_id: accountId,
                direction: 'expense' as const,
                category_id: cardTransactionCategoryById[item.id] ?? null,
                amount_minor: item.amount_minor,
                occurred_at: isoOrNull(item.occurred_at) ?? new Date().toISOString(),
                description: item.description,
                // Bu obligation (kart borcu) silinince aynı ekstreden kategorilere ayrılmış
                // harcamalar da (ON DELETE CASCADE) birlikte silinsin diye kaynağına bağlanır —
                // aksi halde ekstre silindikten sonra Hareketler'de yetim kayıtlar kalıyordu.
                source_obligation_id: obligation.id,
              }))
            );
          } catch {
            // Ana obligation kaydı yine de kalır; kullanıcı Hareketler'den harcamaları
            // manuel ekleyebilir. Sessizce yutulmaz, aşağıda kullanıcıya bildirilir.
            cardTransactionsFailed = true;
          }
        }

        // Çek/senet karşılığı seçilen kayıtlar, çek/senet tutarı kadar (en eski vade önce) kapanır.
        if (
          (documentType === 'cek' || documentType === 'senet') &&
          (direction === 'payable' || direction === 'receivable') &&
          settleTargetIds.length > 0
        ) {
          const targets = settlementTargets.filter((o) => settleTargetIds.includes(o.id));
          const { allocations } = allocateAcrossObligations(obligation.total_amount_minor, targets);
          await settleWithInstrument({
            workspaceId: activeWorkspaceId,
            instrumentObligationId: obligation.id,
            method: documentType,
            direction,
            documentNo: documentNumber.trim() || null,
            paidAt: new Date().toISOString(),
            allocations,
          });
        }

        await markDocumentConfirmed(id as string, { obligationId: obligation.id });
        await syncObligationReminder(activeWorkspaceId, obligation);
        return { installmentPlanFailed, cardTransactionsFailed };
      }

      if (!accountId) throw new Error('Hesap seçin');
      const transaction =
        direction === 'income' || direction === 'expense'
          ? await createTransaction({
              workspace_id: activeWorkspaceId,
              account_id: accountId,
              direction,
              category_id: categoryId,
              counterparty_id: resolvedCounterpartyId,
              amount_minor: amountMinor,
              occurred_at: isoOrNull(dueDate) ?? new Date().toISOString(),
              description: title.trim() || null,
            })
          : null;
      if (transaction) {
        await markDocumentConfirmed(id as string, { transactionId: transaction.id });
      }
    },
    onSuccess: (result) => {
      // Kredi taksit önizlemesi gibi çok satırlı bir listenin hemen ardından cache
      // invalidation + ekran değişimi tetiklemek, Fabric henüz mount/unmount
      // transaction'ını bitirmeden view'ları söküp "componentViewDescriptorWithTag"
      // assertion'ıyla native çökmeye yol açabiliyor (bkz. obligations/[id].tsx'teki
      // aynı düzeltme). Bu yüzden navigasyon Alert'in "Tamam" butonunda hemen (senkron)
      // tetiklenir, invalidation ise InteractionManager.runAfterInteractions ile bir
      // sonraki tick'e ertelenir — ikisi aynı anda/ters sırada çalışırsa modal hâlâ
      // mount'tayken arka planda liste yeniden render olup çökmeye yol açar.
      function invalidateAll() {
        if (!activeWorkspaceId) return;
        invalidatePaymentRelatedQueries(queryClient, activeWorkspaceId);
        queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'financial_documents'] });
      }

      // Kısmi başarılar sessizce geçilmez: ana kayıt oluştu ama yan kayıtlar
      // (taksit planı / ekstre harcamaları) yazılamadıysa kullanıcı bunu bilmeli.
      const partialFailureMessage = result?.installmentPlanFailed
        ? 'Borç kaydedildi ancak taksit planı otomatik oluşturulamadı. Kaydı açıp taksitleri manuel ekleyebilirsiniz.'
        : result?.cardTransactionsFailed
          ? 'Kart borcu kaydedildi ancak ekstre harcamaları işlem olarak eklenemedi. Hareketler ekranından manuel ekleyebilirsiniz.'
          : null;

      if (partialFailureMessage) {
        Alert.alert(
          result?.installmentPlanFailed ? 'Taksitler oluşturulamadı' : 'Harcamalar eklenemedi',
          partialFailureMessage,
          [
            {
              text: 'Tamam',
              onPress: () => {
                router.replace('/(tabs)/hareketler');
                InteractionManager.runAfterInteractions(invalidateAll);
              },
            },
          ]
        );
      } else {
        showSaveSuccess(
          'Belge başarıyla onaylandı ve kayıt oluşturuldu.',
          () => router.replace('/(tabs)/hareketler'),
          invalidateAll
        );
      }
    },
    // Önceden onError yoktu: kayıt oluşturma (RLS/kısıt/tutar-tarih) hataları yalnızca sessiz
    // isError state'ine düşüyor, kullanıcı "Kaydet"e bastıktan sonra ne olduğunu göremiyordu.
    onError: (error) => showErrorAlert(error),
  });

  const discardMutation = useMutation({
    mutationFn: () => discardDocument(id as string),
    onSuccess: () => {
      showSaveSuccess('Belge başarıyla silindi.', () => router.back(), () => {
        if (activeWorkspaceId) {
          queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'financial_documents'] });
        }
      });
    },
  });

  function handleDiscard() {
    Alert.alert(
      'Belgeyi İptal Et',
      'Bu belge inceleme kuyruğundan kaldırılacak ve finansal kayda dönüştürülmeyecek. Emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'İptal Et', style: 'destructive', onPress: () => discardMutation.mutate() },
      ]
    );
  }

  function fieldConfidence(fieldName: string): number | null {
    const field = fieldsQuery.data?.find((f) => f.field_name.toLowerCase() === fieldName.toLowerCase());
    return field?.confidence ?? null;
  }

  // OcrKontrol.html: alan kaynağı etiketi. Düşük güven "Kontrol et" (attentionMarker, kesik çizgi);
  // yeterli güven "Belgeden". Kırmızı yalnızca gecikme/silme içindir.
  function confidenceTag(fieldName: string) {
    const confidence = fieldConfidence(fieldName);
    if (confidence === null) return null;
    return (
      <View style={{ alignSelf: 'flex-start' }}>
        <SourceTag kind={confidence < LOW_CONFIDENCE_THRESHOLD ? 'check' : 'document'} />
      </View>
    );
  }

  if (documentQuery.isLoading || !documentQuery.data) {
    return (
      <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text variant="body" color="textSecondary">
            Yükleniyor...
          </Text>
        </Stack>
      </SafeAreaView>
    );
  }

  const document = documentQuery.data;
  // POS yalnızca tahsilat alır, ondan ödeme yapılamaz — borç/gider yönünde HESAP
  // seçeneklerinden çıkarılır; alacak/gelir yönünde (ör. POS'tan tahsilat) orada kalır.
  const isPayingOut = direction === 'payable' || direction === 'expense';
  const accountOptions =
    documentType === 'kredi_karti_ekstresi'
      ? (accountsQuery.data ?? []).filter((account) => account.type === 'credit_card')
      : isPayingOut
        ? (accountsQuery.data ?? []).filter((account) => account.type !== 'pos')
        : (accountsQuery.data ?? []);
  const canSubmit =
    !!amount &&
    ((direction === 'payable' || direction === 'receivable') ? !!documentType : !!accountId) &&
    (!splitsCardSpending || !!accountId);
  const statementMatchingReady =
    !splitsCardSpending || (!statementCandidatesQuery.isFetching && !statementCandidatesQuery.isError);

  const isLoanDocument = documentType === 'kredi';
  // Kredi kartı hesapları her zaman TRY'dir (bkz. app/accounts/new.tsx isCash koşulu) —
  // ekstre borcu o hesaba bağlı olduğundan burada para birimi seçimi anlamsızdır.
  const isCreditCardStatement = documentType === 'kredi_karti_ekstresi';
  // OCR bir tarih okuduysa ve kullanıcı belirli bir ekstre dönemi seçerek buraya geldiyse
  // (bkz. paramExpectedDueDate notu yukarıda), ikisi farklı aylara düşüyorsa yumuşak bir
  // uyarı gösterilir — kaydı engellemez, sadece yanlış belge/ay taranmış olabileceğini işaret eder.
  const dueDatePeriodMismatch =
    !!paramExpectedDueDate && !!dueDate && dueDate.slice(0, 7) !== paramExpectedDueDate.slice(0, 7);
  const expectedDueDateMonthLabel = paramExpectedDueDate
    ? new Date(paramExpectedDueDate).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
    : '';
  const principalMinor = parseAmountToMinor(amount) ?? 0;
  const totalRepaymentMinor =
    installmentDrafts.length > 0
      ? installmentDrafts.reduce((sum, item) => sum + (parseAmountToMinor(item.amount) ?? 0), 0)
      : ocrTotalRepaymentMinor;
  const totalInterestMinor = totalRepaymentMinor !== null ? totalRepaymentMinor - principalMinor : null;

  // Gezinme çubuğunda 17 pt tek satır: uzun tür adlarında (ör. Kredi Kartı Ekstresi) yalnızca "Kontrol et".
  const typeLabel = documentType ? (DOCUMENT_TYPE_LABEL[documentType] ?? 'Belge') : 'Belge';
  const reviewTitle = typeLabel.length > 10 ? 'Kontrol et' : `${typeLabel} · Kontrol et`;
  const isPdf = document.mime_type === 'application/pdf';
  // Ödeme planı tablosu satırları (OCR taslakları) ve özet değerler.
  const todayIso = localIsoDate();
  const planRows: InstallmentPlanRow[] = installmentDrafts
    .filter((d) => !!d.dueDate)
    .map((d) => ({
      key: d.id,
      number: d.sortOrder,
      dueDate: d.dueDate,
      amountMinor: parseAmountToMinor(d.amount) ?? 0,
      status: d.paid ? 'paid' : d.dueDate < todayIso ? 'overdue' : 'upcoming',
    }));
  const autoPaidCount = installmentDrafts.filter((d) => d.paid && !!d.dueDate && d.dueDate < todayIso).length;
  const firstOpenDraft = installmentDrafts.find((d) => !d.paid) ?? installmentDrafts[0];
  const monthlyInstallmentMinor = firstOpenDraft ? parseAmountToMinor(firstOpenDraft.amount) : null;
  const editingDraft = editingDraftIndex !== null ? (installmentDrafts[editingDraftIndex] ?? null) : null;
  function updateDraft(patch: Partial<{ dueDate: string; amount: string; paid: boolean }>) {
    if (editingDraftIndex === null) return;
    setInstallmentDrafts((prev) => prev.map((d, i) => (i === editingDraftIndex ? { ...d, ...patch } : d)));
  }

  // Tuval OCR ekranları: yön iki eksende seçilir — taraf (ödeyeceğim / tahsil edeceğim) ve
  // zaman (vadeli / ödendi). Çek, senet, kredi ve kart ekstresi her zaman vadelidir.
  const side: 'out' | 'in' = direction === 'payable' || direction === 'expense' ? 'out' : 'in';
  const realized = direction === 'expense' || direction === 'income';
  const alwaysScheduled = !!documentType && ALWAYS_SCHEDULED_TYPES.has(documentType);
  function applyDirection(next: Direction) {
    setDirection(next);
    const willPayOut = next === 'payable' || next === 'expense';
    if (willPayOut && accountsQuery.data?.find((a) => a.id === accountId)?.type === 'pos') {
      setAccountId(null);
    }
  }
  const sideLabels = realized ? { out: 'Gider', in: 'Gelir' } : { out: 'Ben ödeyeceğim', in: 'Ben tahsil edeceğim' };
  const accountRequired = realized || isCreditCardStatement || splitsCardSpending;
  const accountLabel = isCreditCardStatement
    ? 'Kredi kartı'
    : realized
      ? side === 'out'
        ? 'Ödendiği hesap'
        : 'Girdiği hesap'
      : side === 'out'
        ? 'Ödenecek hesap'
        : 'Tahsil edilecek hesap';
  const selectedType = DOCUMENT_TYPES.find((t) => t.id === documentType) ?? null;
  const detectedType = !!document.document_type && document.document_type === documentType;

  return (
    <SafeAreaView key={reflowKey} edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: theme.screenEdge.standard }}>
          <ScreenHeader inline title={reviewTitle} leftLabel={{ label: 'Vazgeç', onPress: () => router.back() }} />
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.lg }}
        >
          <Stack gap="md">
            {/* Belge önizlemesi: hafif dolgulu kutuda kâğıt; sağ altta Büyüt / Aç, sol üstte güven. */}
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel={isPdf ? 'Belgeyi aç' : 'Belgeyi büyüt'}
              disabled={!imageUrl}
              onPress={() => {
                if (!imageUrl) return;
                if (isPdf) void WebBrowser.openBrowserAsync(imageUrl);
                else setPreviewOpen(true);
              }}
              style={{ height: 200, borderRadius: theme.radius.group, backgroundColor: theme.colors.fill, overflow: 'hidden' }}
            >
              {!isPdf && imageUrl ? (
                <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', paddingTop: 18 }}>
                  <View
                    style={{
                      width: 168,
                      height: 210,
                      borderRadius: 4,
                      backgroundColor: '#FBFAF6',
                      padding: 16,
                      gap: 7,
                      shadowColor: '#000',
                      shadowOpacity: 0.25,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 6 },
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Ionicons name={isPdf ? 'document-text' : 'image-outline'} size={14} color="#6E6F66" />
                      <Text numberOfLines={1} style={{ flex: 1, fontSize: 9, fontWeight: '700', color: '#1F2126' }}>
                        {document.file_name ?? typeLabel}
                      </Text>
                    </View>
                    {[0.9, 0.7, 0.8, 0.55, 0.85, 0.6].map((w, i) => (
                      <View key={i} style={{ height: 4, width: `${w * 100}%`, borderRadius: 2, backgroundColor: '#D5D4CC' }} />
                    ))}
                    <View style={{ marginTop: 8, height: 14, borderRadius: 3, borderWidth: 1.5, borderColor: theme.colors.brandPrimary, backgroundColor: 'rgba(255,176,0,0.18)' }} />
                  </View>
                </View>
              )}
              {document.overall_confidence !== null && document.overall_confidence !== undefined ? (
                <View style={[overlayChipStyle, { top: 10, left: 10 }]}>
                  <Ionicons name="scan-outline" size={12} color="#FFFFFF" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>
                    Güven %{Math.round((document.overall_confidence ?? 0) * 100)}
                  </Text>
                </View>
              ) : null}
              {imageUrl ? (
                <View style={[overlayChipStyle, { right: 10, bottom: 10 }]}>
                  <Ionicons name={isPdf ? 'open-outline' : 'expand-outline'} size={12} color="#FFFFFF" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>{isPdf ? 'PDF’i aç' : 'Büyüt'}</Text>
                </View>
              ) : null}
            </Pressable>

            {/* docs/04-ocr-belge-isleme.md — okuması şüpheli alanlar kullanıcı onaylamadan önce açıkça gösterilir. */}
            {(warningsQuery.data ?? []).length > 0 ? (
              <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: theme.radius.group, backgroundColor: withAlpha(theme.colors.brandPrimary, 0.13) }}>
                <Ionicons name="alert-circle" size={20} color={theme.colors.attentionMarker} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600' }}>Kontrol edilmesi gerekenler</Text>
                  {(warningsQuery.data ?? []).map((warning) => (
                    <Text key={warning} variant="caption" style={{ color: theme.colors.textPrimary }}>
                      {warning}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Algılanan belge türü + Değiştir (tuval: .ic.brs + başlık + "Değiştir"). */}
            <DocumentTypePicker
              selectedId={documentType}
              onSelect={setDocumentType}
              renderTrigger={(_, open) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {selectedType ? (
                    <CategoryIcon icon={selectedType.icon} color={selectedType.color} size={36} />
                  ) : (
                    <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.fill }}>
                      <Ionicons name="document-outline" size={18} color={theme.colors.textSecondary} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
                      {selectedType?.name ?? 'Belge türü seçin'}
                    </Text>
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      {detectedType ? 'Belge türü otomatik algılandı' : selectedType ? 'Belge türü elle seçildi' : 'Belge türü okunamadı'}
                    </Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={open} hitSlop={8}>
                    <Text style={{ fontSize: 15, fontWeight: '500', color: theme.colors.textSecondary }}>Değiştir</Text>
                  </Pressable>
                </View>
              )}
            />

            <Stack gap="xs">
              <SegmentedControl
                options={[
                  { key: 'out', label: sideLabels.out },
                  { key: 'in', label: sideLabels.in },
                ]}
                value={side}
                onChange={(next) => applyDirection(realized ? (next === 'out' ? 'expense' : 'income') : next === 'out' ? 'payable' : 'receivable')}
              />
              {alwaysScheduled ? null : (
                <SegmentedControl
                  options={[
                    { key: 'scheduled', label: side === 'out' ? 'Vadeli · ödenecek' : 'Vadeli · tahsil edilecek' },
                    { key: 'realized', label: side === 'out' ? 'Ödendi · gider' : 'Tahsil edildi · gelir' },
                  ]}
                  value={realized ? 'realized' : 'scheduled'}
                  onChange={(next) =>
                    applyDirection(next === 'realized' ? (side === 'out' ? 'expense' : 'income') : side === 'out' ? 'payable' : 'receivable')
                  }
                />
              )}
            </Stack>

            {/* Kaydın kimliği üstte: başlık, belge no, kategori. */}
            <FieldGroup>
              <TextField label={isLoanDocument ? 'Kredi adı' : 'Başlık'} value={title} onChangeText={setTitle} />
              {!realized ? (
                <TextField label="Belge no" tag={confidenceTag('documentNumber')} value={documentNumber} onChangeText={setDocumentNumber} />
              ) : null}
              {!splitsCardSpending && (categoriesQuery.data ?? []).length > 0 ? (
                <CategoryPicker label="Kategori" categories={categoriesQuery.data ?? []} selectedId={categoryId} onSelect={setCategoryId} />
              ) : null}
            </FieldGroup>

            {/* Ana alanlar tek gruplu yüzeyde (tuval .grp > .f / .row). */}
            <FieldGroup>
              <AmountField
                label={isLoanDocument ? 'Kredi tutarı (ana para)' : isCreditCardStatement ? 'Dönem borcu' : 'Tutar'}
                tag={confidenceTag('totalAmount')}
                value={amount}
                onChangeText={setAmount}
                style={{ fontSize: 24, fontWeight: '700' }}
              />
              {!isLoanDocument ? (
                <DateField
                  label={realized ? 'Tarih' : isCreditCardStatement ? 'Son ödeme tarihi' : 'Vade tarihi'}
                  tag={confidenceTag('dueDate')}
                  value={dueDate}
                  onChangeText={setDueDate}
                />
              ) : null}
              {documentType && BANK_DOCUMENT_TYPES.has(documentType) ? (
                <BankPicker label="Banka" placeholder="Banka seçin (isteğe bağlı)" selectedId={bankCode} onSelect={setSelectedBankCode} />
              ) : null}
              {!(documentType && COUNTERPARTY_LESS_DOCUMENT_TYPES.has(documentType)) && activeWorkspaceId ? (
                <CounterpartyPicker
                  label={documentType === 'cek' || documentType === 'senet' ? (side === 'out' ? 'Lehtar' : 'Keşideci') : realized ? 'Satıcı / müşteri' : 'Kişi / firma'}
                  workspaceId={activeWorkspaceId}
                  counterparties={counterpartiesQuery.data ?? []}
                  selectedId={counterpartyId}
                  onSelect={(value) => {
                    setCounterpartyId(value);
                    setSettleTargetIds([]);
                  }}
                />
              ) : null}
              {accountOptions.length > 0 ? (
                <AccountPicker
                  accounts={accountOptions}
                  selectedId={accountId}
                  onSelect={setAccountId}
                  label={accountRequired && !accountId ? `${accountLabel} · gerekli` : accountLabel}
                  placeholder={accountRequired ? 'Hesap seçin' : 'Hesap seçin (isteğe bağlı)'}
                />
              ) : (
                <FormRow
                  label={accountLabel}
                  value={isCreditCardStatement ? 'Bu ekstreyle eşleşen kayıtlı kredi kartı yok.' : "Önce Hesaplar'dan bir hesap ekleyin."}
                />
              )}
            </FieldGroup>
            {!realized && !isCreditCardStatement ? (
              <Stack gap="xs">
                <Row align="center">
                  <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                    Para birimi
                  </Text>
                  {confidenceTag('currency')}
                </Row>
                <SegmentedControl options={CURRENCY_OPTIONS} value={valueUnitCode} onChange={setValueUnitCode} />
              </Stack>
            ) : null}
            {!bankCode && extractedBankName && documentType && BANK_DOCUMENT_TYPES.has(documentType) ? (
              <Text variant="caption" color="textSecondary">
                Belgede “{extractedBankName}” okundu ama listede eşleşen banka bulunamadı — yukarıdan seçin.
              </Text>
            ) : null}
            {!isLoanDocument && dueDatePeriodMismatch ? (
              <Text variant="caption" color="danger">
                Bu tarih, {expectedDueDateMonthLabel} dönemi için seçtiğiniz ekstreyle uyuşmuyor gibi görünüyor — doğru olduğundan emin olun.
              </Text>
            ) : null}
            {isCreditCardStatement && !accountId && cardLastFourFromOcr ? (
              <Button
                label={quickAddCardMutation.isPending ? 'Kart oluşturuluyor…' : `•••• ${cardLastFourFromOcr} kartını oluştur ve devam et`}
                variant="secondary"
                size="compact"
                icon="add"
                onPress={() => quickAddCardMutation.mutate()}
                loading={quickAddCardMutation.isPending}
              />
            ) : null}

            {isInstrumentDocument && counterpartyId && settlementTargets.length > 0 ? (
              <Card>
                <Stack gap="sm">
                  <Stack gap="xxs">
                    <Text variant="cardTitle">
                      Bu {documentType === 'cek' ? 'çek' : 'senet'} hangi kaydın karşılığı?
                    </Text>
                    <Text variant="caption" color="textSecondary">
                      Seçilen kayıtlar bu tutar kadar kapanır; para vadede{' '}
                      {direction === 'receivable' ? 'tahsil edildiğinde hesaba girer' : 'ödendiğinde hesaptan çıkar'}.
                      Seçmezseniz bağımsız yeni bir kayıt açılır ve aynı borç iki kez görünebilir.
                    </Text>
                  </Stack>
                  {settlementTargets.map((target) => {
                    const selected = settleTargetIds.includes(target.id);
                    return (
                      <Pressable
                        key={target.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        onPress={() =>
                          setSettleTargetIds((prev) =>
                            prev.includes(target.id) ? prev.filter((x) => x !== target.id) : [...prev, target.id]
                          )
                        }
                      >
                        <Row gap="sm" align="center">
                          <Ionicons
                            name={selected ? 'checkbox' : 'square-outline'}
                            size={22}
                            color={selected ? theme.colors.brandPrimary : theme.colors.textSecondary}
                          />
                          <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                            {target.title}
                          </Text>
                          <Text variant="body" tabular>
                            {formatMinorAmount(target.remaining_amount_minor, target.currency_code)}
                          </Text>
                        </Row>
                      </Pressable>
                    );
                  })}
                </Stack>
              </Card>
            ) : null}


            {isLoanDocument ? (
              <FieldGroup>
                <TextField
                  label="Faiz oranı % (isteğe bağlı)"
                  keyboardType="decimal-pad"
                  placeholder="Örn. 2,5"
                  value={interestRatePercent}
                  onChangeText={setInterestRatePercent}
                />
                {installmentDrafts.length > 0 ? (
                  <FormRow label="Taksit sayısı" value={String(installmentDrafts.length)} />
                ) : null}
                {monthlyInstallmentMinor !== null ? (
                  <FormRow label="Aylık taksit" value={formatMinorAmount(monthlyInstallmentMinor, valueUnitCode)} />
                ) : null}
                {totalInterestMinor !== null ? (
                  <FormRow label="Faiz (toplam)" value={formatMinorAmount(totalInterestMinor, valueUnitCode)} />
                ) : null}
                {totalRepaymentMinor !== null ? (
                  <FormRow label="Toplam geri ödeme" value={formatMinorAmount(totalRepaymentMinor, valueUnitCode)} />
                ) : null}
              </FieldGroup>
            ) : null}

            {isLoanDocument && installmentDrafts.length > 0 ? (
              <Stack gap="xs">
                <Row align="center" style={{ paddingHorizontal: 4 }}>
                  <Text variant="label" color="textSecondary" style={{ flex: 1 }}>
                    TAKSİTLER · {installmentDrafts.length}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    Düzenlemek için dokunun
                  </Text>
                </Row>
                <InstallmentPlanTable
                  currencyCode={valueUnitCode}
                  rows={planRows}
                  onRowPress={(row) => setEditingDraftIndex(installmentDrafts.findIndex((d) => d.id === row.key))}
                />
                {autoPaidCount > 0 ? (
                  <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: theme.radius.group, backgroundColor: withAlpha(theme.colors.brandPrimary, 0.13) }}>
                    <Ionicons name="information-circle" size={18} color={theme.colors.attentionMarker} />
                    <Text variant="caption" style={{ flex: 1, color: theme.colors.textPrimary }}>
                      Vadesi geçmiş {autoPaidCount} taksit &ldquo;ödendi&rdquo; olarak işaretlenecek ve hiçbir hesabın bakiyesini
                      etkilemeyecek. İstemiyorsanız taksite dokunup değiştirebilirsiniz.
                    </Text>
                  </View>
                ) : null}
              </Stack>
            ) : null}

            {documentType === 'kredi_karti_ekstresi' && cardTransactionItems.length > 0 ? (
              <Stack gap="sm">
                <Text variant="label" color="textSecondary">
                  EKSTRE HARCAMALARI ({cardExpenseItems.length} işlem)
                </Text>
                <SegmentedControl
                  options={[
                    { key: 'total', label: 'Sadece Toplam Borç' },
                    { key: 'categorize', label: 'Kategorilere Ayır' },
                  ]}
                  value={categorizeCardSpending ? 'categorize' : 'total'}
                  onChange={(key) => setCategorizeCardSpending(key === 'categorize')}
                />
                {categorizeCardSpending ? (
                  <Card>
                    <Stack gap="sm">
                      <Text variant="caption" color="textSecondary">
                        Aynı karttaki mevcut hareketler tutar, tarih ve açıklamaya göre karşılaştırılır.
                      </Text>
                      {statementCandidatesQuery.isFetching ? (
                        <Text variant="caption" color="textSecondary">Mevcut hareketler karşılaştırılıyor…</Text>
                      ) : null}
                      {statementCandidatesQuery.isError ? (
                        <Text variant="caption" color="danger">
                          Mevcut hareketler karşılaştırılamadı. Kaydetmeden önce tekrar deneyin.
                        </Text>
                      ) : null}
                      {cardExpenseItems.map((item) => {
                        const match = cardMatches.get(item.id);
                        const skipped = shouldSkipMatchedItem(item.id);
                        return (
                          <Stack key={item.id} gap="xxs">
                            <Row align="center">
                              <Stack gap="xxs" style={{ flex: 1 }}>
                                <Text variant="body" numberOfLines={1}>{item.description || 'İşlem'}</Text>
                                <Text variant="caption" color="textSecondary">
                                  {item.occurred_at ?? 'Tarih okunamadı'} · {cardLineLabel(item.kind)}
                                </Text>
                              </Stack>
                              <Text variant="body" tabular>
                                {formatMinorAmount(item.amount_minor, document.currency_code ?? 'TRY')}
                              </Text>
                            </Row>
                            {match ? (
                              <Text variant="caption" color={skipped ? 'success' : 'accentViolet'}>
                                {skipped ? 'Mevcut hareketle eşleşti' : 'Olası eşleşme'}: {match.transaction.occurred_at.slice(0, 10)} · {match.transaction.description || 'Açıklamasız'}
                              </Text>
                            ) : null}
                            {skipped ? (
                              <Button
                                label="Yine de yeni ekle"
                                variant="secondary"
                                onPress={() => setCardMatchOverrides((previous) => ({ ...previous, [item.id]: 'import' }))}
                              />
                            ) : match ? (
                              <Button
                                label="Mevcut hareketle eşleştir"
                                variant="secondary"
                                onPress={() => setCardMatchOverrides((previous) => ({ ...previous, [item.id]: 'skip' }))}
                              />
                            ) : (categoriesQuery.data ?? []).length > 0 ? (
                              <CategoryPicker
                                categories={categoriesQuery.data ?? []}
                                selectedId={cardTransactionCategoryById[item.id] ?? null}
                                onSelect={(catId) =>
                                  setCardTransactionCategoryById((prev) => ({ ...prev, [item.id]: catId }))
                                }
                              />
                            ) : null}
                          </Stack>
                        );
                      })}
                      {cardOtherItems.length > 0 ? (
                        <Stack gap="xs">
                          <Text variant="label" color="textSecondary">HARCAMA OLARAK EKLENMEYECEK</Text>
                          {cardOtherItems.map((item) => (
                            <Row key={item.id} align="center">
                              <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                                {item.description || 'Ekstre işlemi'} · {cardLineLabel(item.kind)}
                              </Text>
                              <Text variant="body" tabular>
                                {formatMinorAmount(item.amount_minor, document.currency_code ?? 'TRY')}
                              </Text>
                            </Row>
                          ))}
                        </Stack>
                      ) : null}
                      <Text variant="caption" color="textSecondary">
                        {cardItemsToImport.length} harcama kendi tarihiyle karta ve Hareketler&apos;e işlenecek ·{' '}
                        {cardExpenseItems.length - cardItemsToImport.length} mükerrer atlanacak
                      </Text>
                      {splitsCardSpending && !accountId ? (
                        <Text variant="caption" color="danger">
                          Harcamaların işleneceği kredi kartını aşağıdan seçin.
                        </Text>
                      ) : null}
                    </Stack>
                  </Card>
                ) : null}
              </Stack>
            ) : null}

            {confirmMutation.error ? (
              <Text variant="caption" color="danger">
                {confirmMutation.error instanceof Error ? confirmMutation.error.message : 'Kayıt oluşturulamadı'}
              </Text>
            ) : null}
            {discardMutation.error ? (
              <Text variant="caption" color="danger">
                {discardMutation.error instanceof Error ? discardMutation.error.message : 'Belge iptal edilemedi'}
              </Text>
            ) : null}
          </Stack>
        </ScrollView>
        {/* Tuval: eylemler içerikle kaymayan, üst çizgili sabit alt çubukta. */}
        <View
          style={{
            paddingHorizontal: theme.screenEdge.standard,
            paddingTop: theme.spacing.sm,
            paddingBottom: Math.max(insets.bottom, theme.spacing.sm),
            gap: 6,
            borderTopWidth: 1,
            borderTopColor: theme.colors.separator,
            backgroundColor: theme.colors.backgroundPrimary,
          }}
        >
          <Row gap="xxs" align="center" style={{ justifyContent: 'center' }}>
            <Ionicons name="lock-closed" size={12} color={theme.colors.textSecondary} />
            <Text variant="caption" color="textSecondary">
              Onaylamadan kayıt oluşmaz
            </Text>
          </Row>
          <Button
            label="Kontrol Et ve Kaydet"
            onPress={() => confirmMutation.mutate()}
            loading={confirmMutation.isPending}
            disabled={!canSubmit || !statementMatchingReady}
          />
          <Row style={{ justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '500' }}>Taslak olarak bırak</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handleDiscard}
              disabled={discardMutation.isPending}
              style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 }}
            >
              <Text style={{ fontSize: 15, fontWeight: '500', color: theme.colors.danger }}>
                {discardMutation.isPending ? 'İptal ediliyor…' : 'Belgeyi iptal et'}
              </Text>
            </Pressable>
          </Row>
        </View>
      </KeyboardAvoidingView>

      <BottomSheet
        visible={!!editingDraft}
        onClose={() => setEditingDraftIndex(null)}
        title={editingDraft ? `${editingDraft.sortOrder}. taksit` : undefined}
      >
        {editingDraft ? (
          <Stack gap="md">
            <FieldGroup>
              <DateField label="Vade" value={editingDraft.dueDate} onChangeText={(value) => updateDraft({ dueDate: value })} />
              <AmountField label="Taksit tutarı" value={editingDraft.amount} onChangeText={(value) => updateDraft({ amount: value })} />
            </FieldGroup>
            <Row align="center" style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}>
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Text style={{ fontWeight: '500' }}>Ödendi</Text>
                <Text variant="caption" color="textSecondary">
                  Ödenmiş taksit hesap bakiyesini etkilemeden kapalı kaydedilir.
                </Text>
              </Stack>
              <Switch
                value={editingDraft.paid}
                onValueChange={(value) => updateDraft({ paid: value })}
                trackColor={{ false: theme.colors.border, true: theme.colors.brandPrimary }}
              />
            </Row>
            <Button label="Tamam" onPress={() => setEditingDraftIndex(null)} />
          </Stack>
        ) : null}
      </BottomSheet>

      <Modal visible={previewOpen} animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000000' }}>
          {imageUrl ? <Image source={{ uri: imageUrl }} style={{ flex: 1 }} resizeMode="contain" /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kapat"
            onPress={() => setPreviewOpen(false)}
            style={{
              position: 'absolute',
              top: insets.top + 8,
              right: 16,
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.18)',
            }}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const overlayChipStyle = {
  position: 'absolute' as const,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 4,
  height: 26,
  paddingHorizontal: 9,
  borderRadius: 13,
  backgroundColor: 'rgba(0,0,0,0.55)',
};
