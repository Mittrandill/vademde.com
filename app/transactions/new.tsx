import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, DateField, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { CategoryPicker } from '@/components/finance/CategoryPicker';
import { AccountPicker } from '@/components/finance/AccountPicker';
import { listAccounts } from '@/features/accounts/api';
import { listCategories } from '@/features/categories/api';
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  getTransaction,
  updateTransaction,
  type Transaction,
} from '@/features/transactions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { showSuccessAlert } from '@/utils/alerts';
import { parseAmountToMinor } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';

type Direction = 'income' | 'expense' | 'transfer';

const DIRECTIONS: Array<{ value: Direction; label: string }> = [
  { value: 'expense', label: 'Gider' },
  { value: 'income', label: 'Gelir' },
  { value: 'transfer', label: 'Transfer' },
];

export default function NewTransactionScreen() {
  const theme = useTheme();
  const { id, accountId, direction, description } = useLocalSearchParams<{
    id?: string;
    accountId?: string;
    direction?: string;
    description?: string;
  }>();
  const isEditing = !!id;

  const existingQuery = useQuery({
    queryKey: ['transaction', id],
    queryFn: () => getTransaction(id as string),
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
    <TransactionForm
      id={isEditing ? (id as string) : null}
      initial={existingQuery.data ?? null}
      initialAccountId={typeof accountId === 'string' ? accountId : undefined}
      initialDirection={DIRECTIONS.some((d) => d.value === direction) ? (direction as Direction) : undefined}
      initialDescription={typeof description === 'string' ? description : undefined}
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
}

function TransactionForm({ id, initial, initialAccountId, initialDirection, initialDescription }: TransactionFormProps) {
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
  const [amount, setAmount] = useState(initial ? (initial.amount_minor / 100).toFixed(2).replace('.', ',') : '');
  const [dateStr, setDateStr] = useState(
    initial ? initial.occurred_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState(initial?.description ?? initialDescription ?? '');

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const accounts = accountsQuery.data ?? [];

  const categoriesQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.categories(activeWorkspaceId, direction === 'transfer' ? undefined : direction)
      : ['categories', 'disabled'],
    queryFn: () => listCategories(activeWorkspaceId as string, direction === 'transfer' ? undefined : direction),
    enabled: !!activeWorkspaceId && direction !== 'transfer',
  });
  const categories = categoriesQuery.data ?? [];

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
        amount_minor: amountMinor,
        occurred_at: occurredAt,
        description: description.trim() || null,
      });
    },
    onSuccess: () => {
      if (activeWorkspaceId) {
        queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'transactions'] });
      }
      showSuccessAlert(isEditing ? 'Hareket başarıyla güncellendi.' : 'Hareket başarıyla oluşturuldu.', () =>
        router.back()
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTransaction(id as string),
    onSuccess: () => {
      if (activeWorkspaceId) {
        queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'transactions'] });
      }
      showSuccessAlert('Hareket başarıyla silindi.', () => router.back());
    },
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
              }}
              stretch
            />

            <TextField label="TUTAR" placeholder="0,00" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                {direction === 'transfer' ? 'KAYNAK HESAP' : 'HESAP'}
              </Text>
              {accounts.length === 0 ? (
                <Text variant="body" color="textSecondary">
                  Önce Hesaplar&apos;dan bir hesap ekleyin.
                </Text>
              ) : (
                <AccountPicker
                  accounts={accounts}
                  selectedId={accountId}
                  onSelect={setAccountId}
                  title="Kaynak Hesap Seç"
                  placeholder="Hesap seçin"
                />
              )}
            </Stack>

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
