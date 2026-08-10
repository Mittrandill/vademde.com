import { useEffect, useState } from 'react';
import { Alert, InteractionManager, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { AmountField, Button, Card, DateField, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { CategoryPicker } from '@/components/finance/CategoryPicker';
import { AccountPicker } from '@/components/finance/AccountPicker';
import { CounterpartyPicker } from '@/components/finance/CounterpartyPicker';
import { DocumentTypePicker } from '@/components/finance/DocumentTypePicker';
import { BankPicker } from '@/components/finance/BankPicker';
import { ServicePicker } from '@/components/finance/ServicePicker';
import { ValueUnitPicker } from '@/components/finance/ValueUnitPicker';
import { BANK_DOCUMENT_TYPES } from '@/features/obligations/documentTypes';
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
  type Obligation,
} from '@/features/obligations/api';
import { createTransaction } from '@/features/transactions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatAmountInput, parseValueUnitAmountToMinor, formatMinorAmount, formatValueUnitAmount } from '@/utils/money';
import { buildAmortizedInstallments, type InstallmentPlanItem } from '@/utils/installmentPlan';
import { queryKeys } from '@/services/queryKeys';
import { syncObligationReminder } from '@/services/notifications';
import { showSuccessAlert } from '@/utils/alerts';

type Direction = 'payable' | 'receivable';

const DIRECTIONS: Array<{ value: Direction; label: string }> = [
  { value: 'payable', label: 'Borç' },
  { value: 'receivable', label: 'Alacak' },
];

const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

export default function NewObligationScreen() {
  const theme = useTheme();
  const { id, type, accountId, dueDate } = useLocalSearchParams<{
    id?: string;
    type?: string;
    accountId?: string;
    dueDate?: string;
  }>();
  const isEditing = !!id;

  const existingQuery = useQuery({
    queryKey: ['obligation', id, 'edit'],
    queryFn: () => getObligationWithInstallments(id as string),
    enabled: isEditing,
  });

  if (isEditing && !existingQuery.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
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
      id={isEditing ? (id as string) : null}
      initial={existingQuery.data?.obligation ?? null}
      hasInstallments={(existingQuery.data?.installments.length ?? 0) > 0}
      initialDocumentType={typeof type === 'string' ? type : undefined}
      initialAccountId={typeof accountId === 'string' ? accountId : undefined}
      initialDueDate={typeof dueDate === 'string' ? dueDate : undefined}
    />
  );
}

interface ObligationFormProps {
  id: string | null;
  initial: Obligation | null;
  hasInstallments: boolean;
  initialDocumentType?: string;
  /** Hesap detayından "Ekstre Ekle" gibi kısayollarla gelindiğinde hesabı önceden doldurur. */
  initialAccountId?: string;
  /** Ekstre tablosunda belirli bir geçmiş ayın "Yüklenmedi" satırından gelindiğinde o ayın
   * beklenen son ödeme tarihini önceden doldurur (bkz. app/accounts/[id].tsx) — kullanıcı
   * her zaman elle değiştirebilir. */
  initialDueDate?: string;
}

function ObligationForm({ id, initial, hasInstallments, initialDocumentType, initialAccountId, initialDueDate }: ObligationFormProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const isEditing = !!id;

  const [direction, setDirection] = useState<Direction>((initial?.direction as Direction) ?? 'payable');
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
  const [counterpartyId, setCounterpartyId] = useState<string | null>(initial?.counterparty_id ?? null);
  const [accountId, setAccountId] = useState<string | null>(initial?.account_id ?? initialAccountId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(initial?.category_id ?? null);
  const [installmentCountStr, setInstallmentCountStr] = useState('1');
  const [interestRateStr, setInterestRateStr] = useState('');
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

  // docs/01-finansal-kayit-modeli.md §3.5 — kıymetli maden/döviz kaydı P1 MVP kapsamında
  // yalnızca tek seferlik borç/alacak olarak tutulur; taksitlendirme (buildAmortizedInstallments,
  // bkz. utils/installmentPlan.ts) tam sayı kuruş varsayımıyla çalışıyor ve adet/gram bazlı
  // kesirli birimler için genelleştirilmemiş. Taksit sayısı fiat dışında 1'e sabitlenir.
  const installmentCount = isFiatUnit ? Math.max(1, Math.min(60, parseInt(installmentCountStr, 10) || 1)) : 1;
  const enteredAmountMinor = parseValueUnitAmountToMinor(totalAmount, valueUnitCode) ?? 0;
  // Aboneliklerde TUTAR alanı aylık ödemeyi temsil eder; toplam, aylık × ay sayısıdır.
  // Diğer türlerde (nakit avans dahil) TUTAR zaten çekilen/anapara tutarın kendisidir —
  // taksitliyse ödenecek toplam faizle birlikte aşağıdaki installments'tan türer, TUTAR
  // alanının kendisi değişmez (bkz. showInterestField/obligationTotalMinor).
  const totalAmountMinor =
    isSubscriptionType && installmentCount > 1 ? enteredAmountMinor * installmentCount : enteredAmountMinor;
  // Faiz oranı kredi VE nakit avansta, birden fazla taksitte istenir — TUTAR alanı bu
  // durumda anaparayı (nakit avansta çekilen tutarı) temsil eder, taksitler azalan bakiye
  // üzerinden hesaplanır ve obligation'ın toplamı anapara+toplam faiz olur (banka kredisi/nakit
  // avans faizi gibi). Tek taksitte (peşin) faiz uygulanmaz, TUTAR = toplam borç kalır.
  const showInterestField =
    !isEditing && isFiatUnit && (documentType === 'kredi' || isCashAdvanceType) && installmentCount > 1;
  const interestRatePercent =
    showInterestField && interestRateStr ? Number(interestRateStr.replace(',', '.')) || 0 : 0;
  const installmentPreview =
    !isEditing && installmentCount > 1 && totalAmountMinor > 0
      ? buildAmortizedInstallments(totalAmountMinor, installmentCount, dueDate, interestRatePercent)
      : [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !title.trim() || !totalAmountMinor || !documentType) {
        throw new Error('Eksik alan var');
      }

      const bankCodeForType = BANK_DOCUMENT_TYPES.has(documentType) ? bankCode : null;
      const serviceCodeForType = isSubscriptionType ? serviceCode : null;
      const counterpartyIdForType = isLoanType || isSubscriptionType || isCashAdvanceType ? null : counterpartyId;

      if (isEditing) {
        const obligation = await updateObligation(id, {
          direction,
          document_type: documentType,
          title: title.trim(),
          due_date: dueDate,
          counterparty_id: counterpartyIdForType,
          account_id: accountId,
          category_id: categoryId,
          bank_code: bankCodeForType,
          service_code: serviceCodeForType,
          ...(hasInstallments ? {} : { total_amount_minor: totalAmountMinor }),
        });
        await syncObligationReminder(activeWorkspaceId, obligation);
        return obligation;
      }

      // Faiz oranı girildiyse taksitler azalan bakiye üzerinden hesaplanır; obligation'ın
      // toplamı taksitlerin gerçek toplamı (anapara+faiz) olmalı ki kalan borç/ilerleme
      // hesapları doğru kalsın.
      const installments =
        installmentCount > 1
          ? buildAmortizedInstallments(totalAmountMinor, installmentCount, dueDate, interestRatePercent)
          : [];
      const obligationTotalMinor =
        installments.length > 0 ? installments.reduce((sum, item) => sum + item.amountMinor, 0) : totalAmountMinor;

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

      if (installments.length > 0) {
        await createInstallmentPlan({
          workspaceId: activeWorkspaceId,
          obligationId: obligation.id,
          totalAmountMinor: obligationTotalMinor,
          installments,
        });
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
    totalAmountMinor > 0 &&
    !!documentType &&
    (!isLoanType || !!bankCode) &&
    (!isCashAdvanceType || !!accountId);

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
                {isSubscriptionType ? `AYLIK ÖDEME (${valueUnit.quantityLabel})` : `TUTAR (${valueUnit.quantityLabel})`}
              </Text>
              {isEditing && hasInstallments ? (
                <Text variant="body" color="textSecondary">
                  {formatValueUnitAmount(totalAmountMinor, valueUnitCode)} — taksit planı olan kayıtlarda tutar
                  düzenlenemez.
                </Text>
              ) : (
                <AmountField
                  placeholder={valueUnit.precision === 0 ? '1' : '0,00'}
                  precision={valueUnit.precision}
                  value={totalAmount}
                  onChangeText={setTotalAmount}
                />
              )}
            </Stack>

            <DateField
              label={!isEditing && installmentCount > 1 ? 'İLK VADE' : 'VADE'}
              value={dueDate}
              onChangeText={setDueDate}
            />

            {isLoanType || isSubscriptionType || isCashAdvanceType ? null : (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  KİŞİ / FİRMA
                </Text>
                {activeWorkspaceId ? (
                  <CounterpartyPicker
                    workspaceId={activeWorkspaceId}
                    counterparties={counterpartiesQuery.data ?? []}
                    selectedId={counterpartyId}
                    onSelect={setCounterpartyId}
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
                  // Nakit avansta HESAP yalnızca kredi kartı olabilir — önceden seçilmiş bir
                  // kart-dışı hesap varsa (veya tersi yönde geçilirken) geçersiz kalmasın diye temizlenir.
                  if (value === 'nakit_avans' && !creditCardAccounts.some((a) => a.id === accountId)) {
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
                {isCashAdvanceType ? 'KREDİ KARTI' : 'HESAP (İSTEĞE BAĞLI)'}
              </Text>
              {(isCashAdvanceType ? creditCardAccounts : accountsQuery.data ?? []).length === 0 ? (
                <Text variant="body" color="textSecondary">
                  {isCashAdvanceType
                    ? "Önce Hesaplar'dan bir kredi kartı ekleyin."
                    : "Önce Hesaplar'dan bir hesap ekleyin."}
                </Text>
              ) : (
                <AccountPicker
                  accounts={isCashAdvanceType ? creditCardAccounts : accountsQuery.data ?? []}
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
                label={isSubscriptionType ? 'KAÇ AY' : 'TAKSİT SAYISI'}
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
                    {isSubscriptionType ? 'AY ÖNİZLEME' : 'TAKSİT ÖNİZLEME'}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    Toplam {formatMinorAmount(installmentPreview.reduce((sum, i) => sum + i.amountMinor, 0))}
                  </Text>
                </Row>
                <InstallmentPreviewTimeline
                  items={installmentPreview}
                  unitLabel={isSubscriptionType ? 'ay' : 'taksit'}
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

// app/obligations/[id].tsx'teki gerçek taksit listesinin ("taksit zaman çizgisi",
// docs/08-tasarim-sistemi.md §12.15) önizleme karşılığı — numaralı işaretçiler + bağlayan
// dikey çizgi + kart satırları aynı görsel dilde, ama bunlar henüz kaydedilmemiş taslak
// veri olduğu için ödendi/sıradaki durumu yok: yalnızca ilk taksit vurgulanır (bir sonraki
// ödeme olacağı için), diğerleri nötr anahat kalır.
function InstallmentPreviewTimeline({ items, unitLabel }: { items: InstallmentPlanItem[]; unitLabel: string }) {
  const theme = useTheme();

  return (
    <Stack gap="xxs">
      {items.map((item, index) => {
        const isFirst = index === 0;
        const isLast = index === items.length - 1;
        const markerBg = isFirst ? theme.colors.brandPrimary : 'transparent';
        const markerBorder = isFirst ? theme.colors.brandPrimary : theme.colors.border;
        const markerTextColor = isFirst ? theme.colors.brandPrimaryText : theme.colors.textSecondary;

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
                  borderWidth: isFirst ? 0 : 1.5,
                  borderColor: markerBorder,
                  backgroundColor: markerBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="caption" style={{ color: markerTextColor, fontWeight: '700' }}>
                  {item.installmentNumber}
                </Text>
              </View>
              {!isLast ? (
                <View style={{ flex: 1, width: 2, borderRadius: 1, backgroundColor: theme.colors.border }} />
              ) : null}
            </Stack>

            <View style={{ flex: 1 }}>
              <Card elevated={isFirst}>
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
              </Card>
            </View>
          </Row>
        );
      })}
    </Stack>
  );
}
