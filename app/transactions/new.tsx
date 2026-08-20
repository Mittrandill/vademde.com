import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { AmountField, Button, DateField, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
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
import { useWorkspaceStore } from '@/store/workspaceStore';
import { showSaveSuccess, showErrorAlert } from '@/utils/alerts';
import { formatAmountInput, formatMinorAmount, parseAmountToMinor } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';

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
  const [amount, setAmount] = useState(
    initial ? formatAmountInput((initial.amount_minor / 100).toFixed(2).replace('.', ',')) : ''
  );
  const [dateStr, setDateStr] = useState(
    initial ? initial.occurred_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
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

  const categoriesQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.categories(activeWorkspaceId, direction === 'transfer' ? undefined : direction)
      : ['categories', 'disabled'],
    queryFn: () => listCategories(activeWorkspaceId as string, direction === 'transfer' ? undefined : direction),
    enabled: !!activeWorkspaceId && direction !== 'transfer',
  });
  const categories = categoriesQuery.data ?? [];

  const counterpartiesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.counterparties(activeWorkspaceId) : ['counterparties', 'disabled'],
    queryFn: () => listCounterparties(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId && direction !== 'transfer',
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !accountId || !amount) throw new Error('Eksik alan var');
      const amountMinor = parseAmountToMinor(amount);
      if (amountMinor === null) throw new Error('Tutar okunamadı, kontrol edin');
      // Geçersiz tarihte new Date(...).toISOString() RangeError fırlatıp kaydı düşürürdü.
      const parsedDate = new Date(dateStr);
      if (Number.isNaN(parsedDate.getTime())) throw new Error('Tarih okunamadı, kontrol edin');
      const occurredAt = parsedDate.toISOString();

      if (isEditing) {
        if (direction === 'transfer' && !transferToAccountId) throw new Error('Hedef hesap seçin');
        return updateTransaction(id, {
          account_id: accountId,
          transfer_to_account_id: direction === 'transfer' ? transferToAccountId : null,
          direction,
          category_id: direction === 'transfer' ? null : categoryId,
          counterparty_id: direction === 'transfer' ? null : counterpartyId,
          payment_method: direction === 'transfer' ? null : paymentMethod || null,
          amount_minor: amountMinor,
          occurred_at: occurredAt,
          description: description.trim() || null,
        });
      }

      if (direction === 'transfer') {
        if (!transferToAccountId) throw new Error('Hedef hesap seçin');
        return createTransfer({
          workspaceId: activeWorkspaceId,
          fromAccountId: accountId,
          toAccountId: transferToAccountId,
          amountMinor,
          occurredAt,
          description: description.trim() || undefined,
        });
      }
      return createTransaction({
        workspace_id: activeWorkspaceId,
        account_id: accountId,
        direction,
        category_id: categoryId,
        counterparty_id: counterpartyId,
        payment_method: paymentMethod || null,
        amount_minor: amountMinor,
        occurred_at: occurredAt,
        description: description.trim() || null,
      });
    },
    onSuccess: () => {
      showSaveSuccess(
        isEditing ? 'Hareket başarıyla güncellendi.' : 'Hareket başarıyla oluşturuldu.',
        () => router.back(),
        () => {
          if (activeWorkspaceId) {
            queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'transactions'] });
          }
        }
      );
    },
    onError: (error) => showErrorAlert(error),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTransaction(id as string),
    onSuccess: () => {
      showSaveSuccess('Hareket başarıyla silindi.', () => router.back(), () => {
        if (activeWorkspaceId) {
          queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'transactions'] });
        }
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

  // POS hesabına girilen tahsilattan otomatik düşülecek komisyonun önizlemesi — gerçek
  // kesinti Supabase'teki maintain_pos_commission trigger'ında olur (bkz. o migration'ın
  // yorumu), burası yalnızca kullanıcıya bilgi verir, hiçbir girdi/onay istemez.
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const posCommissionRate = selectedAccount?.type === 'pos' ? selectedAccount.pos_commission_rate : null;
  const amountMinorPreview = parseAmountToMinor(amount);
  const showPosCommissionPreview =
    direction === 'income' && !!posCommissionRate && amountMinorPreview !== null && amountMinorPreview > 0;
  const posCommissionFeeMinor = showPosCommissionPreview
    ? Math.round((amountMinorPreview as number) * (posCommissionRate as number) / 100)
    : 0;
  const posCommissionNetMinor = showPosCommissionPreview ? (amountMinorPreview as number) - posCommissionFeeMinor : 0;

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
                {isEditing ? 'Hareketi Düzenle' : 'Yeni Hareket'}
              </Text>
            </Row>

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

            <AmountField label="TUTAR" placeholder="0,00" value={amount} onChangeText={setAmount} />

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                {direction === 'transfer' ? 'KAYNAK HESAP' : 'HESAP'}
              </Text>
              {(direction === 'transfer' ? transferSourceAccounts : accountsForDirection).length === 0 ? (
                <Text variant="body" color="textSecondary">
                  {direction === 'transfer'
                    ? 'Transfer için kredi kartı dışında en az bir hesap gerekir.'
                    : direction === 'expense' && accounts.length > 0
                      ? 'POS dışında en az bir hesap gerekir.'
                      : "Önce Hesaplar'dan bir hesap ekleyin."}
                </Text>
              ) : (
                <AccountPicker
                  accounts={direction === 'transfer' ? transferSourceAccounts : accountsForDirection}
                  selectedId={accountId}
                  onSelect={setAccountId}
                  title="Kaynak Hesap Seç"
                  placeholder="Hesap seçin"
                />
              )}
            </Stack>

            {showPosCommissionPreview ? (
              <Text variant="caption" color="textSecondary">
                Bu tahsilattan %{posCommissionRate} POS komisyonu (
                {formatMinorAmount(posCommissionFeeMinor, selectedAccount!.currency_code)}) otomatik düşülecek,
                kasaya net {formatMinorAmount(posCommissionNetMinor, selectedAccount!.currency_code)} geçecek.
              </Text>
            ) : null}

            {direction === 'transfer' ? (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  HEDEF HESAP
                </Text>
                <AccountPicker
                  accounts={accounts.filter((a) => a.id !== accountId)}
                  selectedId={transferToAccountId}
                  onSelect={setTransferToAccountId}
                  title="Hedef Hesap Seç"
                  placeholder="Hedef hesap seçin"
                />
              </Stack>
            ) : (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  KATEGORİ
                </Text>
                {categories.length === 0 ? (
                  <Text variant="body" color="textSecondary">
                    Bu türde kategori bulunamadı.
                  </Text>
                ) : (
                  <CategoryPicker categories={categories} selectedId={categoryId} onSelect={setCategoryId} />
                )}
              </Stack>
            )}

            {direction === 'transfer' ? null : (
              <>
                <Stack gap="sm">
                  <Text variant="caption" color="textSecondary">
                    KİŞİ / FİRMA (İSTEĞE BAĞLI)
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

                <Stack gap="sm">
                  <Text variant="caption" color="textSecondary">
                    ÖDEME YÖNTEMİ (İSTEĞE BAĞLI)
                  </Text>
                  <SegmentedControl<PaymentMethod | ''>
                    options={PAYMENT_METHODS.map((m) => ({ key: m.value, label: m.label }))}
                    value={paymentMethod}
                    onChange={setPaymentMethod}
                    scrollable
                  />
                </Stack>
              </>
            )}

            <DateField label="TARİH" value={dateStr} onChangeText={setDateStr} />

            <TextField
              label="AÇIKLAMA (İSTEĞE BAĞLI)"
              placeholder="Örn. Market alışverişi"
              value={description}
              onChangeText={setDescription}
            />

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
