import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useExitGuard } from '@/utils/useExitGuard';
import { useReflowKey } from '@/services/reflow';
import { BigAmountInput, Button, Card, DateField, FieldGroup, FormRow, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { CategoryPicker } from '@/components/finance/CategoryPicker';
import { AccountPicker } from '@/components/finance/AccountPicker';
import { CounterpartyPicker } from '@/components/finance/CounterpartyPicker';
import { listAccounts } from '@/features/accounts/api';
import { listCategories } from '@/features/categories/api';
import { listCounterparties } from '@/features/counterparties/api';
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  getTransaction,
  updateTransaction,
  type Transaction,
} from '@/features/transactions/api';
import { ACTIVE_OBLIGATION_STATUSES, listObligations, type ObligationWithRelations, localIsoDate } from '@/features/obligations/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { showSaveSuccess, showErrorAlert } from '@/utils/alerts';
import { formatAmountInput, formatMinorAmount, parseValueUnitAmountToMinor } from '@/utils/money';
import { getValueUnit } from '@/features/valueUnits/units';
import { ReceiptAttachField } from '@/components/finance/ReceiptAttachField';
import { ScanPromptBanner } from '@/components/finance/ScanPromptBanner';
import { TransferAccounts } from '@/components/finance/TransferAccounts';
import { getAccountBalances } from '@/features/reports/api';
import {
  attachReceiptFile,
  getTransactionReceipt,
  removeTransactionReceipts,
  useDocumentArchiveAccess,
  type PendingReceipt,
} from '@/features/receipts/api';
import { queryKeys, invalidatePaymentRelatedQueries } from '@/services/queryKeys';

type Direction = 'income' | 'expense' | 'transfer';
type PaymentMethod = 'nakit' | 'havale' | 'kredi_karti' | 'online_odeme' | 'diger';

const DIRECTIONS: Array<{ value: Direction; label: string }> = [
  { value: 'expense', label: 'Gider' },
  { value: 'income', label: 'Gelir' },
  { value: 'transfer', label: 'Transfer' },
];

// Çek/senet birer finansal kayıt türüdür (obligations.document_type, bkz.
// docs/01-finansal-kayit-modeli.md §3) — burada yer almaz; cari detayından "Tahsilat/Ödeme
// Ekle → Çek/Senet" seçilirse doğrudan /obligations/new'e yönlendirilir (bkz.
// app/counterparties/[id].tsx). Bu liste yalnızca anlık/gerçekleşmiş hareketlerin ödeme
// yöntemini etiketler.
const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'nakit', label: 'Nakit' },
  { value: 'havale', label: 'Havale/EFT' },
  { value: 'kredi_karti', label: 'Kredi Kartı' },
  { value: 'online_odeme', label: 'Online Ödeme' },
  { value: 'diger', label: 'Diğer' },
];

export default function NewTransactionScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const { id, accountId, direction, description, counterpartyId, paymentMethod } = useLocalSearchParams<{
    id?: string;
    accountId?: string;
    direction?: string;
    description?: string;
    counterpartyId?: string;
    paymentMethod?: string;
  }>();
  const isEditing = !!id;

  const existingQuery = useQuery({
    queryKey: ['transaction', id],
    queryFn: () => getTransaction(id as string),
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
    <TransactionForm
      key={reflowKey}
      id={isEditing ? (id as string) : null}
      initial={existingQuery.data ?? null}
      initialAccountId={typeof accountId === 'string' ? accountId : undefined}
      initialDirection={DIRECTIONS.some((d) => d.value === direction) ? (direction as Direction) : undefined}
      initialDescription={typeof description === 'string' ? description : undefined}
      initialCounterpartyId={typeof counterpartyId === 'string' ? counterpartyId : undefined}
      initialPaymentMethod={
        PAYMENT_METHODS.some((m) => m.value === paymentMethod) ? (paymentMethod as PaymentMethod) : undefined
      }
    />
  );
}

interface TransactionFormProps {
  id: string | null;
  initial: Transaction | null;
  /** Hesap detayından "Ek Hesap Faizi Ekle" gibi kısayollarla gelindiğinde hesabı/yönü/açıklamayı önceden doldurur. */
  initialAccountId?: string;
  initialDirection?: Direction;
  initialDescription?: string;
  /** Cari detayından "Tahsilat/Ödeme Ekle" kısayoluyla gelindiğinde kişi/firmayı ve ödeme
   * yöntemini önceden doldurur (bkz. app/counterparties/[id].tsx). */
  initialCounterpartyId?: string;
  initialPaymentMethod?: PaymentMethod;
}

function TransactionForm({
  id,
  initial,
  initialAccountId,
  initialDirection,
  initialDescription,
  initialCounterpartyId,
  initialPaymentMethod,
}: TransactionFormProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const isEditing = !!id;

  const [direction, setDirection] = useState<Direction>(
    (initial?.direction as Direction) ?? initialDirection ?? 'expense'
  );
  const [accountId, setAccountId] = useState<string | null>(initial?.account_id ?? initialAccountId ?? null);
  const [transferToAccountId, setTransferToAccountId] = useState<string | null>(
    initial?.transfer_to_account_id ?? null
  );
  const [categoryId, setCategoryId] = useState<string | null>(initial?.category_id ?? null);
  // Sikke birimli hesaplarda (ceyrek_altin vb.) minor = adet'tir; ÷100/×100 uygulanmaz.
  const initialPrecision = getValueUnit(initial?.currency_code).precision;
  const [amount, setAmount] = useState(
    initial
      ? formatAmountInput(
          (initial.amount_minor / 10 ** initialPrecision).toFixed(initialPrecision).replace('.', ','),
          initialPrecision
        )
      : ''
  );
  const [dateStr, setDateStr] = useState(
    initial ? initial.occurred_at.slice(0, 10) : localIsoDate()
  );
  const [description, setDescription] = useState(initial?.description ?? initialDescription ?? '');
  const [counterpartyId, setCounterpartyId] = useState<string | null>(
    initial?.counterparty_id ?? initialCounterpartyId ?? null
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(
    (initial?.payment_method as PaymentMethod | null) ?? initialPaymentMethod ?? ''
  );
  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const accounts = accountsQuery.data ?? [];
  // Transfer olarak açılan (hızlı işlem ya da mevcut transferi düzenleme) ekranda tür seçici
  // gösterilmez; tuvaldeki Transfer ekranı yalnızca transferdir.
  const transferOnly = initialDirection === 'transfer' || initial?.direction === 'transfer';
  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.reportAccountBalances(activeWorkspaceId) : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId && direction === 'transfer',
  });
  const balances = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b.balanceMinor]));
  // Bir kredi kartından "hesaplar arası transfer" kaynağı olmak anlamsız — kart zaten bir
  // borç hesabıdır, ondan para "çıkmaz". Kaynak listesinden çıkarılır. Hedef olarak ise
  // kredi kartı geçerlidir — kart borcuna ödeme tam olarak budur (bkz. features/reports/api.ts
  // getAccountBalances, features/payments/api.ts recordCardPayment ile aynı mekanizma).
  const transferSourceAccounts = accounts.filter((a) => a.type !== 'credit_card');
  // POS bir tahsilat cihazıdır — yalnızca gelir (kart/nakit tahsilatı) alır, ondan ödeme
  // yapılamaz. Gider yönünde HESAP seçeneklerinden çıkarılır; gelirde ve transferde
  // (kasaya nakit çekme gibi) POS yine seçilebilir kalır.
  const payableAccounts = accounts.filter((a) => a.type !== 'pos');
  const accountsForDirection = direction === 'expense' ? payableAccounts : accounts;
  const unitCode = accounts.find((a) => a.id === accountId)?.currency_code ?? initial?.currency_code ?? 'TRY';
  const unitPrecision = getValueUnit(unitCode).precision;

  // Dekont (Plus): yeni seçilen dosya ya da düzenlemede mevcut bağlantı. Transfer hareketlerinde
  // dekont alanı gösterilmez (iki hesabı kapsayan tek kanıt anlamsız).
  const archive = useDocumentArchiveAccess();
  const [receipt, setReceipt] = useState<PendingReceipt | null>(null);
  const { allowExit } = useExitGuard(!isEditing && (amount.trim() !== '' || description.trim() !== ''));
  const [removedExisting, setRemovedExisting] = useState(false);
  const existingReceiptQuery = useQuery({
    queryKey: ['transaction-receipt', id],
    queryFn: () => getTransactionReceipt(id as string),
    enabled: !!id && isEditing,
  });
  const existingReceiptId = removedExisting ? null : (existingReceiptQuery.data?.id ?? null);

  // Tüm kategoriler tek seferde çekilip türe göre burada süzülür: Gider ↔ Gelir geçişinde liste
  // yeniden yüklenirken boş görünüp "kategori bulunamadı" denmez.
  const categoriesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.categories(activeWorkspaceId) : ['categories', 'disabled'],
    queryFn: () => listCategories(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const categories = (categoriesQuery.data ?? []).filter((c) => c.kind === direction);

  const counterpartiesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.counterparties(activeWorkspaceId) : ['counterparties', 'disabled'],
    queryFn: () => listCounterparties(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId && direction !== 'transfer',
  });

  // Gider → o kişiye olan BORCUNUZ (payable), gelir → o kişiden ALACAĞINIZ (receivable) kapanır.
  const obligationDirection = direction === 'expense' ? 'payable' : direction === 'income' ? 'receivable' : null;
  const openObligationsQuery = useQuery({
    queryKey:
      activeWorkspaceId && counterpartyId && obligationDirection
        ? [activeWorkspaceId, 'obligations', 'counterparty-open', counterpartyId, obligationDirection]
        : ['open-obligations', 'disabled'],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        counterpartyId: counterpartyId as string,
        direction: obligationDirection as 'payable' | 'receivable',
        statuses: ACTIVE_OBLIGATION_STATUSES,
        pageSize: 50,
      }),
    enabled: !isEditing && !!activeWorkspaceId && !!counterpartyId && !!obligationDirection,
  });
  // Bu hareket o kişiye bir borç/alacak ödemesiyse (fatura, çek, senet...) Ödeme Yap / Tahsilat
  // Al formunda işlenmelidir — orada hangi kaydın kapanacağı seçilir ve çek/senet de desteklenir.
  // Önceden bu form tutarı kişinin en eski açık kaydına kendiliğinden dağıtıyordu; aynı caride
  // hem fatura hem çek varsa havale faturayı değil çeki kapatabiliyordu.
  const openObligations: ObligationWithRelations[] = (openObligationsQuery.data ?? []).filter(
    (o) => o.currency_code === unitCode
  );

  // Hareket zaten kaydedildikten sonra dekontu senkronlar. Dekont yüklenemezse hareket geri
  // alınmaz ve form hata durumuna düşürülmez (tekrar "Kaydet" yinelenen hareket oluştururdu);
  // kullanıcıya ayrıca bildirilir, dekont hareketi düzenleyerek yeniden eklenebilir.
  async function syncReceipt(transactionId: string, amountMinor: number) {
    if (!activeWorkspaceId || direction === 'transfer') return;
    try {
      if (receipt) {
        const document = await attachReceiptFile({
          workspaceId: activeWorkspaceId,
          ...receipt,
          transactionId,
          amountMinor,
          currencyCode: unitCode,
        });
        await removeTransactionReceipts(transactionId, document.id);
      } else if (removedExisting) {
        await removeTransactionReceipts(transactionId);
      }
      queryClient.invalidateQueries({ queryKey: ['transaction-receipt', transactionId] });
      queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'receipt-archive'] });
    } catch (error) {
      Alert.alert(
        'Dekont eklenemedi',
        `Hareket kaydedildi ama dekont yüklenemedi: ${error instanceof Error ? error.message : 'bilinmeyen hata'}. Hareketi düzenleyerek dekontu yeniden ekleyebilirsiniz.`
      );
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !accountId || !amount) throw new Error('Eksik alan var');
      const amountMinor = parseValueUnitAmountToMinor(amount, unitCode);
      if (amountMinor === null) throw new Error('Tutar okunamadı, kontrol edin');
      if (amountMinor <= 0) throw new Error('Tutar sıfırdan büyük olmalı');
      // Geçersiz tarihte new Date(...).toISOString() RangeError fırlatıp kaydı düşürürdü.
      const parsedDate = new Date(dateStr);
      if (Number.isNaN(parsedDate.getTime())) throw new Error('Tarih okunamadı, kontrol edin');
      const occurredAt = parsedDate.toISOString();

      if (isEditing) {
        if (direction === 'transfer' && !transferToAccountId) throw new Error('Hedef hesap seçin');
        const updated = await updateTransaction(id, {
          account_id: accountId,
          transfer_to_account_id: direction === 'transfer' ? transferToAccountId : null,
          direction,
          category_id: direction === 'transfer' ? null : categoryId,
          counterparty_id: direction === 'transfer' ? null : counterpartyId,
          payment_method: direction === 'transfer' ? null : paymentMethod || null,
          amount_minor: amountMinor,
          currency_code: unitCode,
          occurred_at: occurredAt,
          description: description.trim() || null,
        });
        await syncReceipt(id, amountMinor);
        return updated;
      }

      if (direction === 'transfer') {
        if (!transferToAccountId) throw new Error('Hedef hesap seçin');
        return createTransfer({
          workspaceId: activeWorkspaceId,
          fromAccountId: accountId,
          toAccountId: transferToAccountId,
          amountMinor,
          currencyCode: unitCode,
          occurredAt,
          description: description.trim() || undefined,
        });
      }

      const created = await createTransaction({
        workspace_id: activeWorkspaceId,
        account_id: accountId,
        direction,
        category_id: categoryId,
        counterparty_id: counterpartyId,
        payment_method: paymentMethod || null,
        amount_minor: amountMinor,
        currency_code: unitCode,
        occurred_at: occurredAt,
        description: description.trim() || null,
      });
      await syncReceipt(created.id, amountMinor);
      return created;
    },
    onSuccess: () => {
      allowExit();
      const message = isEditing ? 'Hareket başarıyla güncellendi.' : 'Hareket başarıyla oluşturuldu.';
      showSaveSuccess(message, () => router.back(), () => {
        if (activeWorkspaceId) invalidatePaymentRelatedQueries(queryClient, activeWorkspaceId);
      });
    },
    onError: (error) => showErrorAlert(error),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTransaction(id as string),
    onSuccess: () => {
      showSaveSuccess('Hareket başarıyla silindi.', () => router.back(), () => {
        if (activeWorkspaceId) invalidatePaymentRelatedQueries(queryClient, activeWorkspaceId);
      });
    },
    onError: (error) => showErrorAlert(error),
  });

  function confirmDelete() {
    Alert.alert('Hareketi Sil', 'Bu hareket kalıcı olarak silinecek. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }

  const canSubmit =
    !!accountId &&
    !!amount &&
    (direction !== 'transfer' || (!!transferToAccountId && transferToAccountId !== accountId));

  // Girilen bilgilerle Ödeme Yap / Tahsilat Al formuna geçer (bkz. openObligations notu).
  function goToSettlement() {
    const enteredMinor = parseValueUnitAmountToMinor(amount, unitCode);
    router.replace({
      pathname: '/payments/new',
      params: {
        direction: direction === 'income' ? 'receivable' : 'payable',
        ...(counterpartyId ? { counterpartyId } : {}),
        ...(enteredMinor && enteredMinor > 0 ? { amountMinor: String(enteredMinor) } : {}),
        ...(accountId ? { accountId } : {}),
        ...(paymentMethod && paymentMethod !== 'diger' ? { method: paymentMethod } : {}),
        date: dateStr,
        ...(description.trim() ? { description: description.trim() } : {}),
      },
    });
  }

  // POS hesabına girilen tahsilattan otomatik düşülecek komisyonun önizlemesi — gerçek
  // kesinti Supabase'teki maintain_pos_commission trigger'ında olur (bkz. o migration'ın
  // yorumu), burası yalnızca kullanıcıya bilgi verir, hiçbir girdi/onay istemez.
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const posCommissionRate = selectedAccount?.type === 'pos' ? selectedAccount.pos_commission_rate : null;
  const amountMinorPreview = parseValueUnitAmountToMinor(amount, unitCode);
  const showPosCommissionPreview =
    direction === 'income' && !!posCommissionRate && amountMinorPreview !== null && amountMinorPreview > 0;
  const posCommissionFeeMinor = showPosCommissionPreview
    ? Math.round((amountMinorPreview as number) * (posCommissionRate as number) / 100)
    : 0;
  const posCommissionNetMinor = showPosCommissionPreview ? (amountMinorPreview as number) - posCommissionFeeMinor : 0;

  const sourceAccounts = direction === 'transfer' ? transferSourceAccounts : accountsForDirection;
  const symbol = getValueUnit(unitCode).unitType === 'fiat' ? (unitCode === 'TRY' ? '₺' : unitCode === 'USD' ? '$' : unitCode === 'EUR' ? '€' : undefined) : undefined;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard, paddingBottom: theme.spacing.xxl }} keyboardShouldPersistTaps="handled">
          <ScreenHeader
            inline
            title={isEditing ? 'Hareketi düzenle' : direction === 'transfer' ? 'Transfer' : 'Yeni hareket'}
            leftLabel={{ label: 'Vazgeç', onPress: () => router.back() }}
            rightLabel={{
              label: isEditing ? 'Güncelle' : 'Kaydet',
              bold: true,
              disabled: !canSubmit || saveMutation.isPending,
              onPress: () => saveMutation.mutate(),
            }}
          />

          <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xs }}>
            {transferOnly ? null : (
            <SegmentedControl
              options={DIRECTIONS.map((d) => ({ key: d.value, label: d.label }))}
              value={direction}
              onChange={(value) => {
                setDirection(value);
                setCategoryId(null);
                setTransferToAccountId(null);
                if (value === 'transfer' && accounts.find((a) => a.id === accountId)?.type === 'credit_card') {
                  setAccountId(null);
                }
                if (value === 'expense' && accounts.find((a) => a.id === accountId)?.type === 'pos') {
                  setAccountId(null);
                }
              }}
              stretch
            />
            )}

            {direction === 'transfer' ? (
              <TransferAccounts
                // Transfer yalnızca aynı değer birimindeki hesaplar arasında yapılır: tutar iki hesaba da
                // aynen yazıldığı için TL ↔ USD/altın transferi bakiyeleri bozardı.
                sourceAccounts={transferSourceAccounts.filter(
                  (a) =>
                    a.id !== transferToAccountId &&
                    (!transferToAccountId || a.currency_code === accounts.find((t) => t.id === transferToAccountId)?.currency_code)
                )}
                targetAccounts={accounts.filter(
                  (a) => a.id !== accountId && (!accountId || a.currency_code === unitCode)
                )}
                fromId={accountId}
                toId={transferToAccountId}
                onFromChange={(value) => {
                  setAccountId(value);
                  const target = accounts.find((a) => a.id === transferToAccountId);
                  const next = accounts.find((a) => a.id === value);
                  if (target && next && target.currency_code !== next.currency_code) setTransferToAccountId(null);
                }}
                onToChange={setTransferToAccountId}
                canSwap={
                  !!accountId &&
                  !!transferToAccountId &&
                  accounts.find((a) => a.id === transferToAccountId)?.type !== 'credit_card'
                }
                onSwap={() => {
                  setAccountId(transferToAccountId);
                  setTransferToAccountId(accountId);
                }}
                balances={balances}
              />
            ) : null}

            <View style={{ marginTop: theme.spacing.md, marginBottom: theme.spacing.xs }}>
              <BigAmountInput
                value={amount}
                onChangeText={setAmount}
                precision={unitPrecision}
                symbol={symbol}
                autoFocus={!isEditing}
              />
            </View>

            {!isEditing && direction !== 'transfer' ? (
              <ScanPromptBanner description="Dekont, fiş veya fatura fotoğrafını tara; tutar, tarih ve hesap otomatik dolsun." />
            ) : null}

            {direction === 'transfer' ? (
              <>
                <Text variant="caption" color="textSecondary" style={{ textAlign: 'center', paddingHorizontal: 30 }}>
                  Transfer gelir ya da gider sayılmaz; toplam varlık değişmez.
                </Text>
                {transferSourceAccounts.length === 0 ? (
                  <Text variant="caption" color="danger" style={{ textAlign: 'center' }}>
                    Transfer için kredi kartı dışında en az bir hesap gerekir.
                  </Text>
                ) : null}
                <FieldGroup>
                  <TextField label="Not" placeholder="Örn. Çek için aktarım" value={description} onChangeText={setDescription} />
                  <DateField label="Tarih" value={dateStr} onChangeText={setDateStr} />
                </FieldGroup>
              </>
            ) : (
            <FieldGroup>
              <TextField label="Açıklama" placeholder="Örn. Market alışverişi" value={description} onChangeText={setDescription} />
              {categoriesQuery.isPending ? (
                <FormRow label="Kategori" value="Kategoriler yükleniyor…" />
              ) : categories.length === 0 ? (
                <FormRow
                  label="Kategori"
                  value={`${direction === 'income' ? 'Gelir' : 'Gider'} kategorisi yok. Kategoriler'den ekleyebilirsiniz.`}
                />
              ) : (
                <CategoryPicker categories={categories} selectedId={categoryId} onSelect={setCategoryId} label="Kategori" />
              )}
              {sourceAccounts.length === 0 ? (
                <FormRow
                  label="Hesap"
                  value={
                    direction === 'expense' && accounts.length > 0
                        ? 'POS dışında en az bir hesap gerekir.'
                        : "Önce Hesaplar'dan bir hesap ekleyin."
                  }
                />
              ) : (
                <AccountPicker
                  accounts={sourceAccounts}
                  selectedId={accountId}
                  onSelect={setAccountId}
                  title="Hesap seç"
                  placeholder="Hesap seçin"
                  label="Hesap"
                />
              )}
              <DateField label="Tarih" value={dateStr} onChangeText={setDateStr} />
            </FieldGroup>
            )}

            {showPosCommissionPreview ? (
              <Text variant="caption" color="textSecondary">
                Bu tahsilattan %{posCommissionRate} POS komisyonu (
                {formatMinorAmount(posCommissionFeeMinor, selectedAccount!.currency_code)}) otomatik düşülecek,
                kasaya net {formatMinorAmount(posCommissionNetMinor, selectedAccount!.currency_code)} geçecek.
              </Text>
            ) : null}

            {direction === 'transfer' ? null : (
              <>
                <Stack gap="xs">
                  <Text variant="label" color="textSecondary">
                    Kişi / firma
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

                {!isEditing && counterpartyId && openObligations.length > 0 ? (
                  <Pressable accessibilityRole="button" onPress={goToSettlement}>
                    <Card>
                      <Row gap="sm" align="center">
                        <Stack gap="xxs" style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '600' }}>
                            {direction === 'income' ? 'Bu bir tahsilat mı?' : 'Bu bir borç ödemesi mi?'}
                          </Text>
                          <Text variant="caption" color="textSecondary">
                            Bu kişiyle {openObligations.length} açık {direction === 'income' ? 'alacak' : 'borç'} var.
                            Kapatmak için {direction === 'income' ? 'Tahsilat Al' : 'Ödeme Yap'} ile kaydedin; burada
                            kaydedilen hareket açık kayıtları düşürmez.
                          </Text>
                        </Stack>
                        <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
                      </Row>
                    </Card>
                  </Pressable>
                ) : null}

                <Stack gap="xs">
                  <Text variant="label" color="textSecondary">
                    Ödeme yöntemi
                  </Text>
                  <SegmentedControl<PaymentMethod | ''>
                    options={PAYMENT_METHODS.map((m) => ({ key: m.value, label: m.label }))}
                    value={paymentMethod}
                    onChange={setPaymentMethod}
                    scrollable
                  />
                </Stack>

                <ReceiptAttachField
                  value={receipt}
                  onChange={setReceipt}
                  existingReceiptId={existingReceiptId}
                  onRemoveExisting={() => setRemovedExisting(true)}
                  allowed={archive.allowed}
                />
              </>
            )}

            {saveMutation.error ? (
              <Text variant="caption" color="danger">
                {saveMutation.error instanceof Error ? saveMutation.error.message : 'Kayıt kaydedilemedi'}
              </Text>
            ) : null}

            {isEditing ? (
              <Button
                label="Hareketi sil"
                variant="dangerText"
                onPress={confirmDelete}
                loading={deleteMutation.isPending}
                disabled={saveMutation.isPending}
              />
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
