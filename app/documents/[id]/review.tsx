import { useEffect, useState } from 'react';
import { Alert, Image, InteractionManager, KeyboardAvoidingView, Platform, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Button, Card, DateField, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { CategoryPicker } from '@/components/finance/CategoryPicker';
import { AccountPicker } from '@/components/finance/AccountPicker';
import { CounterpartyPicker } from '@/components/finance/CounterpartyPicker';
import { DocumentTypePicker } from '@/components/finance/DocumentTypePicker';
import { BankPicker } from '@/components/finance/BankPicker';
import { BankLogo } from '@/components/finance/BankLogo';
import {
  deleteDocumentOriginal,
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
import { createObligation, createInstallmentPlan, type Installment } from '@/features/obligations/api';
import { recordPastInstallmentPayments } from '@/features/payments/api';
import { createTransaction, createTransactions } from '@/features/transactions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount, parseAmountToMinor } from '@/utils/money';
import {
  DOCUMENT_TYPE_LABEL,
  DOCUMENT_TYPE_ICON,
  BANK_DOCUMENT_TYPES,
  COUNTERPARTY_LESS_DOCUMENT_TYPES,
} from '@/features/obligations/documentTypes';
import { matchBankByName } from '@/features/banks/banks';
import { queryKeys } from '@/services/queryKeys';
import { syncObligationReminder } from '@/services/notifications';
import { syncCreditCardStatementReminder } from '@/services/creditCardReminders';
import { showSaveSuccess, showErrorAlert } from '@/utils/alerts';

type Direction = 'payable' | 'receivable' | 'income' | 'expense';

const DIRECTIONS: { key: Direction; label: string }[] = [
  { key: 'payable', label: 'Ben Ödeyeceğim' },
  { key: 'receivable', label: 'Ben Tahsil Edeceğim' },
  { key: 'expense', label: 'Gerçekleşmiş Gider' },
  { key: 'income', label: 'Gerçekleşmiş Gelir' },
];

const LOW_CONFIDENCE_THRESHOLD = 0.7;

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
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [counterpartyResolved, setCounterpartyResolved] = useState(false);
  const [direction, setDirection] = useState<Direction>('payable');
  const [documentType, setDocumentType] = useState<string | null>(paramDocumentType ?? null);
  const [bankCode, setBankCode] = useState<string | null>(null);
  const [extractedBankName, setExtractedBankName] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(paramAccountId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryAutoSet, setCategoryAutoSet] = useState(false);
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
  // Eşleşme bulunamayan (kayıtsız) kart için "kayıtlı kartlara eklensin mi?" sorusu
  // kullanıcıya yalnızca bir kez sorulur.
  const [cardQuickAddOffered, setCardQuickAddOffered] = useState(false);
  // "Sadece toplam borç" ile "harcamaları kategorilere ayır" arasındaki seçim — ikincisinde
  // her ekstre satırı için ayrı bir gider işlemi ve kategori seçimi gerekir.
  const [categorizeCardSpending, setCategorizeCardSpending] = useState(false);
  const [cardTransactionCategoryById, setCardTransactionCategoryById] = useState<Record<string, string | null>>({});
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
  const cardTransactionItems = (lineItemsQuery.data ?? []).filter((item) => item.kind === 'card_transaction');

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

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
    setAmount(document.total_amount_minor ? (document.total_amount_minor / 100).toFixed(2).replace('.', ',') : '');
    // OCR bir tarih bulduysa (belge gerçek kaynaktır) o kullanılır; hiç bulamadıysa
    // kullanıcının ekstre tablosundan seçtiği ayın beklenen tarihine düşülür — böylece
    // alan hiç boş/bugünün tarihi kalmaz (bkz. yukarıdaki paramExpectedDueDate notu).
    setDueDate(document.due_date ?? document.issue_date ?? paramExpectedDueDate ?? '');
    setDocumentNumber(document.document_number ?? '');

    // Kredi/kredi kartı ekstresi için Gemini'nin çıkardığı banka adını statik banka
    // listesiyle eşleştirip BankPicker'ı önceden doldur (kullanıcı yine değiştirebilir).
    // Eşleşme bulunamazsa ham ad, banka logosu yerine baş harfli avatar göstermek için saklanır.
    if (document.document_type === 'kredi' || document.document_type === 'kredi_karti_ekstresi') {
      const summary = document.extracted_summary as {
        loan?: {
          bankName?: string | null;
          totalRepaymentMinor?: number | null;
          interestRatePercent?: number | null;
        };
        card?: { bankName?: string | null; cardLastFourDigits?: string | null; statementDate?: string | null };
      } | null;
      const ocrBankName = summary?.loan?.bankName ?? summary?.card?.bankName ?? null;
      setExtractedBankName(ocrBankName);
      const matchedBankCode = matchBankByName(ocrBankName);
      if (matchedBankCode) setBankCode(matchedBankCode);
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

    getSignedUrl(document.storage_path)
      .then(setImageUrl)
      .catch(() => {});
  }, [documentQuery.data, initialized]);

  // docs/04-ocr-belge-isleme.md §6.6 — isim benzerliğiyle kişi/firma eşleştirme;
  // eşleşme yoksa yeni kişi/firma otomatik oluşturulur. Kredi ve kredi kartı ekstresinde
  // OCR'ın "kişi/firma" olarak okuduğu isim aslında bankadır — bu ikisinde banka kimliği
  // zaten bank_code/logo üzerinden temsil edildiğinden ayrıca bir kişi/firma kaydı açılmaz.
  // Çek/senet'te ise isim gerçek bir karşı taraftır (lehtar/borçlu) — orada bu adım çalışır.
  useEffect(() => {
    const document = documentQuery.data;
    if (!document?.counterparty_name || !activeWorkspaceId || !counterpartiesQuery.isSuccess || counterpartyResolved) {
      return;
    }
    if (document.document_type && COUNTERPARTY_LESS_DOCUMENT_TYPES.has(document.document_type)) {
      setCounterpartyResolved(true);
      return;
    }
    setCounterpartyResolved(true);

    const normalizedTarget = document.counterparty_name.trim().toLocaleLowerCase('tr-TR');
    const match = counterpartiesQuery.data.find(
      (c) => c.name.trim().toLocaleLowerCase('tr-TR') === normalizedTarget
    );

    if (match) {
      setCounterpartyId(match.id);
      return;
    }

    createCounterparty({
      workspace_id: activeWorkspaceId,
      name: document.counterparty_name.trim(),
      type: 'individual',
    })
      .then((created) => {
        setCounterpartyId(created.id);
        queryClient.invalidateQueries({ queryKey: queryKeys.counterparties(activeWorkspaceId) });
      })
      .catch(() => {});
  }, [documentQuery.data, counterpartiesQuery.isSuccess, counterpartiesQuery.data, activeWorkspaceId, counterpartyResolved, queryClient]);

  // Kredi kartı ekstresi son 4 hane ↔ mevcut kredi kartı hesabı eşleştirmesi (bkz. yukarıdaki
  // banka adı eşleştirmesiyle aynı desen). accountsQuery, documentQuery'den sonra da
  // dolabileceğinden ayrı bir efekt olarak, ikisi de hazır olduğunda bir kez çalışır.
  useEffect(() => {
    if (cardAccountMatchAttempted || !cardLastFourFromOcr || !accountsQuery.isSuccess || accountId) return;
    setCardAccountMatchAttempted(true);
    const match = accountsQuery.data.find(
      (a) => a.type === 'credit_card' && a.card_last_four === cardLastFourFromOcr
    );
    if (match) setAccountId(match.id);
  }, [cardAccountMatchAttempted, cardLastFourFromOcr, accountsQuery.isSuccess, accountsQuery.data, accountId]);

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

  // Kredi taksit tablosunu (vade + tutar) düzenlenebilir taslağa bir kez kopyalar;
  // sonraki her düzenleme yalnızca yerel taslağı günceller, OCR verisini değil. Vadesi
  // bugünden önce olan taksitler gerçekte zaten ödenmiş olacağından "ödendi" ile başlar
  // (kullanıcı switch'le değiştirebilir) — bkz. confirmMutation, bu taksitler bir hesaba
  // bağlanmadan (bakiyeyi etkilemeden) ödenmiş olarak kaydedilir.
  useEffect(() => {
    if (installmentsInitialized || documentType !== 'kredi' || !lineItemsQuery.data) return;
    const items = lineItemsQuery.data.filter((item) => item.kind === 'installment');
    if (items.length === 0) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    setInstallmentDrafts(
      items.map((item, index) => ({
        id: item.id,
        sortOrder: item.sort_order || index + 1,
        dueDate: item.occurred_at ?? '',
        amount: (item.amount_minor / 100).toFixed(2).replace('.', ','),
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

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId) throw new Error('Çalışma alanı bulunamadı');
      const amountMinor = parseAmountToMinor(amount);
      // Eskiden çözümlenemeyen tutar sessizce NaN olup kayda yazılıyordu; artık kullanıcıya
      // dönülür (docs/01-finansal-kayit-modeli.md §8.1 — tutarsız veri asla yazılmaz).
      if (amountMinor === null) throw new Error('Tutar okunamadı, kontrol edin');

      if (direction === 'payable' || direction === 'receivable') {
        if (!documentType) throw new Error('Belge türü seçin');

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
                draft?.dueDate.trim() || item.occurred_at || dueDate || new Date().toISOString().slice(0, 10);
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

        const obligation = await createObligation({
          workspace_id: activeWorkspaceId,
          direction,
          document_type: documentType,
          title: title.trim() || 'Belge',
          total_amount_minor: installmentsSumMinor ?? amountMinor,
          due_date: earliestInstallmentDueDate ?? dueDate ?? null,
          counterparty_id: counterpartyId,
          account_id: accountId,
          category_id: categoryId,
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
        if (documentType === 'kredi_karti_ekstresi' && categorizeCardSpending && accountId) {
          try {
            await createTransactions(
              cardTransactionItems.map((item) => ({
                workspace_id: activeWorkspaceId,
                account_id: accountId,
                direction: 'expense' as const,
                category_id: cardTransactionCategoryById[item.id] ?? null,
                amount_minor: item.amount_minor,
                occurred_at: isoOrNull(item.occurred_at) ?? new Date().toISOString(),
                description: item.description,
              }))
            );
          } catch {
            // Ana obligation kaydı yine de kalır; kullanıcı Hareketler'den harcamaları
            // manuel ekleyebilir. Sessizce yutulmaz, aşağıda kullanıcıya bildirilir.
            cardTransactionsFailed = true;
          }
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
              counterparty_id: counterpartyId,
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
        queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'obligations'] });
        queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'transactions'] });
        queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'financial_documents'] });
        // docs/07-guvenlik-gizlilik.md §11.3 — kullanıcı "işlem sonrası sakla"yı kapattıysa
        // ham belge artık gerekmiyor; finansal kayıt zaten oluştu, yalnızca dosya silinir.
        if (documentQuery.data?.retain_original === false) {
          deleteDocumentOriginal(documentQuery.data.storage_path).catch(() => {});
        }
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
        if (documentQuery.data?.retain_original === false) {
          deleteDocumentOriginal(documentQuery.data.storage_path).catch(() => {});
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

  function LowConfidenceHint({ fieldName }: { fieldName: string }) {
    const confidence = fieldConfidence(fieldName);
    if (confidence === null || confidence >= LOW_CONFIDENCE_THRESHOLD) return null;
    return (
      <Text variant="caption" style={{ color: theme.colors.danger }}>
        Kontrol et — düşük güven
      </Text>
    );
  }

  if (documentQuery.isLoading || !documentQuery.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text variant="body" color="textSecondary">
            Yükleniyor...
          </Text>
        </Stack>
      </SafeAreaView>
    );
  }

  const document = documentQuery.data;
  const canSubmit =
    !!amount &&
    ((direction === 'payable' || direction === 'receivable') ? !!documentType : !!accountId) &&
    (documentType !== 'kredi_karti_ekstresi' || !categorizeCardSpending || !!accountId);

  const isLoanDocument = documentType === 'kredi';
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: theme.screenEdge.standard,
            // Formun sonundaki üç buton ekranın alt kenarına yapışmasın.
            paddingBottom: theme.spacing.xxl,
          }}
        >
          <Stack gap="lg">
            <Row align="center">
              <Pressable onPress={() => router.back()} hitSlop={12}>
                <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
              </Pressable>
              <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
                Belgeyi Onayla
              </Text>
            </Row>

            {document.mime_type === 'application/pdf' ? (
              <Row
                gap="sm"
                align="center"
                style={{
                  height: 80,
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radius.widget,
                  backgroundColor: theme.colors.surfacePrimary,
                }}
              >
                <Ionicons name="document-text" size={28} color={theme.colors.accentViolet} />
                <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                  {document.file_name}
                </Text>
              </Row>
            ) : imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={{ width: '100%', height: 200, borderRadius: theme.radius.widget }}
                resizeMode="cover"
              />
            ) : null}

            {document.overall_confidence !== null && document.overall_confidence !== undefined ? (
              <Text variant="caption" color="textSecondary">
                Genel güven: %{Math.round((document.overall_confidence ?? 0) * 100)}
              </Text>
            ) : null}

            {/* docs/04-ocr-belge-isleme.md — okuması şüpheli alanlar kullanıcı onaylamadan
                önce açıkça gösterilir (ör. tutar mutabakatı tutmadığında belgede ne yazdığı). */}
            {(warningsQuery.data ?? []).length > 0 ? (
              <Card style={{ borderWidth: 1, borderColor: withAlpha(theme.colors.danger, 0.4) }}>
                <Stack gap="xs">
                  <Row gap="xs" align="center">
                    <Ionicons name="alert-circle-outline" size={18} color={theme.colors.danger} />
                    <Text variant="cardTitle" style={{ color: theme.colors.danger }}>
                      Kontrol edilmesi gerekenler
                    </Text>
                  </Row>
                  {(warningsQuery.data ?? []).map((warning) => (
                    <Text key={warning} variant="caption" color="textSecondary">
                      • {warning}
                    </Text>
                  ))}
                </Stack>
              </Card>
            ) : null}

            <Stack gap="xs">
              <Text variant="caption" color="textSecondary">
                YÖN
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                <SegmentedControl options={DIRECTIONS} value={direction} onChange={setDirection} />
              </ScrollView>
            </Stack>

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                BAŞLIK
              </Text>
              <TextField value={title} onChangeText={setTitle} />
            </Stack>

            <Stack gap="sm">
              <Row align="center">
                <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                  {isLoanDocument ? 'KREDİ TUTARI (ANA PARA)' : 'TUTAR'}
                </Text>
                <LowConfidenceHint fieldName="totalAmount" />
              </Row>
              <TextField keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
            </Stack>

            {isLoanDocument ? (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  FAİZ ORANI % (İSTEĞE BAĞLI)
                </Text>
                <TextField
                  keyboardType="decimal-pad"
                  placeholder="Örn. 2,5"
                  value={interestRatePercent}
                  onChangeText={setInterestRatePercent}
                />
              </Stack>
            ) : null}

            {isLoanDocument && totalInterestMinor !== null ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="caption" color="textSecondary">
                  FAİZ (TOPLAM)
                </Text>
                <Text variant="body" tabular>
                  {formatMinorAmount(totalInterestMinor, document.currency_code ?? 'TRY')}
                </Text>
              </Row>
            ) : null}

            {isLoanDocument && totalRepaymentMinor !== null ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="caption" color="textSecondary">
                  TOPLAM GERİ ÖDEME
                </Text>
                <Text variant="body" tabular>
                  {formatMinorAmount(totalRepaymentMinor, document.currency_code ?? 'TRY')}
                </Text>
              </Row>
            ) : null}

            {!isLoanDocument ? (
              <Stack gap="sm">
                <Row align="center">
                  <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                    VADE
                  </Text>
                  <LowConfidenceHint fieldName="dueDate" />
                </Row>
                <DateField value={dueDate} onChangeText={setDueDate} />
                {dueDatePeriodMismatch ? (
                  <Text variant="caption" color="danger">
                    Bu tarih, {expectedDueDateMonthLabel} dönemi için seçtiğiniz ekstreyle uyuşmuyor gibi görünüyor —
                    doğru olduğundan emin olun.
                  </Text>
                ) : null}
              </Stack>
            ) : null}

            {(direction === 'payable' || direction === 'receivable') && (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  BELGE TÜRÜ
                </Text>
                <DocumentTypePicker selectedId={documentType} onSelect={setDocumentType} />
              </Stack>
            )}

            {isLoanDocument && installmentDrafts.length > 0 ? (
              <Card>
                <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  {installmentDrafts.length} TAKSİT OTOMATİK OLUŞTURULACAK — VADE, TUTAR VE ÖDENDİ DURUMU DÜZENLENEBİLİR
                </Text>
                <Text variant="caption" color="textSecondary">
                  Vadesi geçmiş taksitler otomatik &ldquo;ödendi&rdquo; işaretlenir ve hiçbir hesabın bakiyesini etkilemez.
                </Text>
                {installmentDrafts.map((draft, index) => (
                  <Stack key={draft.id} gap="xxs">
                    <Row gap="xs" align="center">
                      <Text variant="caption" color="textSecondary" style={{ width: 28 }}>
                        {draft.sortOrder}.
                      </Text>
                      <DateField
                        value={draft.dueDate}
                        onChangeText={(value) =>
                          setInstallmentDrafts((prev) =>
                            prev.map((d, i) => (i === index ? { ...d, dueDate: value } : d))
                          )
                        }
                        style={{ flex: 1 }}
                      />
                      <TextField
                        keyboardType="decimal-pad"
                        value={draft.amount}
                        onChangeText={(value) =>
                          setInstallmentDrafts((prev) =>
                            prev.map((d, i) => (i === index ? { ...d, amount: value } : d))
                          )
                        }
                        style={{ flex: 1 }}
                      />
                    </Row>
                    <Row gap="xs" align="center" style={{ justifyContent: 'flex-end' }}>
                      <Text variant="caption" color="textSecondary">
                        Ödendi
                      </Text>
                      <Switch
                        value={draft.paid}
                        onValueChange={(value) =>
                          setInstallmentDrafts((prev) =>
                            prev.map((d, i) => (i === index ? { ...d, paid: value } : d))
                          )
                        }
                        trackColor={{ false: theme.colors.border, true: theme.colors.brandPrimary }}
                      />
                    </Row>
                  </Stack>
                ))}
                </Stack>
              </Card>
            ) : null}

            {documentType && BANK_DOCUMENT_TYPES.has(documentType) ? (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  BANKA (İSTEĞE BAĞLI)
                </Text>
                <Row gap="sm" align="center">
                  <BankLogo bankCode={bankCode} fallbackName={!bankCode ? extractedBankName : null} size={36} />
                  <Stack style={{ flex: 1 }}>
                    <BankPicker selectedId={bankCode} onSelect={setBankCode} />
                  </Stack>
                </Row>
                {!bankCode && extractedBankName ? (
                  <Text variant="caption" color="textSecondary">
                    OCR &ldquo;{extractedBankName}&rdquo; okudu ama listede eşleşen banka bulunamadı — yukarıdan manuel seç.
                  </Text>
                ) : null}
              </Stack>
            ) : null}

            {documentType === 'kredi_karti_ekstresi' && cardTransactionItems.length > 0 ? (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  EKSTRE HARCAMALARI ({cardTransactionItems.length} işlem)
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
                      Her işlem, seçtiğiniz hesaba ayrı bir gider olarak kaydedilir.
                    </Text>
                    {cardTransactionItems.map((item) => (
                      <Stack key={item.id} gap="xxs">
                        <Row align="center">
                          <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                            {item.description || 'İşlem'}
                          </Text>
                          <Text variant="body" tabular>
                            {formatMinorAmount(item.amount_minor, document.currency_code ?? 'TRY')}
                          </Text>
                        </Row>
                        {(categoriesQuery.data ?? []).length > 0 ? (
                          <CategoryPicker
                            categories={categoriesQuery.data ?? []}
                            selectedId={cardTransactionCategoryById[item.id] ?? null}
                            onSelect={(catId) =>
                              setCardTransactionCategoryById((prev) => ({ ...prev, [item.id]: catId }))
                            }
                          />
                        ) : null}
                      </Stack>
                    ))}
                    </Stack>
                  </Card>
                ) : null}
              </Stack>
            ) : null}

            {(direction === 'payable' || direction === 'receivable') && (
              <Stack gap="sm">
                <Row align="center">
                  <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                    BELGE NO
                  </Text>
                  <LowConfidenceHint fieldName="documentNumber" />
                </Row>
                <TextField value={documentNumber} onChangeText={setDocumentNumber} />
              </Stack>
            )}

            {!(documentType && COUNTERPARTY_LESS_DOCUMENT_TYPES.has(documentType)) ? (
              <Stack gap="sm">
                <Row align="center">
                  <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                    KİŞİ / FİRMA
                  </Text>
                  <LowConfidenceHint fieldName="counterpartyName" />
                </Row>
                {activeWorkspaceId ? (
                  <CounterpartyPicker
                    workspaceId={activeWorkspaceId}
                    counterparties={counterpartiesQuery.data ?? []}
                    selectedId={counterpartyId}
                    onSelect={setCounterpartyId}
                  />
                ) : null}
              </Stack>
            ) : null}

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                KATEGORİ (İSTEĞE BAĞLI)
              </Text>
              {(categoriesQuery.data ?? []).length > 0 ? (
                <CategoryPicker categories={categoriesQuery.data ?? []} selectedId={categoryId} onSelect={setCategoryId} />
              ) : null}
            </Stack>

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                {direction === 'income' || direction === 'expense' ? 'HESAP' : 'HESAP (İSTEĞE BAĞLI)'}
              </Text>
              {(accountsQuery.data ?? []).length === 0 ? (
                <Text variant="body" color="textSecondary">
                  Önce Hesaplar'dan bir hesap ekleyin.
                </Text>
              ) : (
                <AccountPicker accounts={accountsQuery.data ?? []} selectedId={accountId} onSelect={setAccountId} />
              )}
            </Stack>

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

            <Button
              label="Kontrol Et ve Kaydet"
              onPress={() => confirmMutation.mutate()}
              loading={confirmMutation.isPending}
              disabled={!canSubmit}
            />
            <Button label="Taslak Olarak Bırak" variant="secondary" onPress={() => router.back()} />
            <Button
              label="İptal Et"
              variant="danger"
              onPress={handleDiscard}
              loading={discardMutation.isPending}
            />
          </Stack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
