import { useState } from 'react';
import { Alert, InteractionManager, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, Pressable, Row, Stack, Text, TextField } from '@/components/primitives';
import { CategoryPicker } from '@/components/finance/CategoryPicker';
import { AccountPicker } from '@/components/finance/AccountPicker';
import { CounterpartyPicker } from '@/components/finance/CounterpartyPicker';
import { DocumentTypePicker } from '@/components/finance/DocumentTypePicker';
import { BankPicker } from '@/components/finance/BankPicker';
import { BANK_DOCUMENT_TYPES } from '@/features/obligations/documentTypes';
import { listAccounts } from '@/features/accounts/api';
import { listCategories } from '@/features/categories/api';
import { listCounterparties } from '@/features/counterparties/api';
import {
  createObligation,
  createInstallmentPlan,
  deleteObligation,
  getObligationWithInstallments,
  updateObligation,
  type Obligation,
} from '@/features/obligations/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { toMinorUnits, formatMinorAmount } from '@/utils/money';
import { buildAmortizedInstallments } from '@/utils/installmentPlan';
import { queryKeys } from '@/services/queryKeys';
import { cancelObligationReminder, syncObligationReminder } from '@/services/notifications';

type Direction = 'payable' | 'receivable';

const DIRECTIONS: Array<{ value: Direction; label: string }> = [
  { value: 'payable', label: 'Borç' },
  { value: 'receivable', label: 'Alacak' },
];

export default function NewObligationScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
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
    />
  );
}

interface ObligationFormProps {
  id: string | null;
  initial: Obligation | null;
  hasInstallments: boolean;
}

function ObligationForm({ id, initial, hasInstallments }: ObligationFormProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const isEditing = !!id;

  const [direction, setDirection] = useState<Direction>((initial?.direction as Direction) ?? 'payable');
  const [documentType, setDocumentType] = useState<string | null>(initial?.document_type ?? null);
  const [bankCode, setBankCode] = useState<string | null>(initial?.bank_code ?? null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [totalAmount, setTotalAmount] = useState(
    initial ? (initial.total_amount_minor / 100).toFixed(2).replace('.', ',') : ''
  );
  const [dueDate, setDueDate] = useState(initial?.due_date ?? new Date().toISOString().slice(0, 10));
  const [counterpartyId, setCounterpartyId] = useState<string | null>(initial?.counterparty_id ?? null);
  const [accountId, setAccountId] = useState<string | null>(initial?.account_id ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(initial?.category_id ?? null);
  const [installmentCountStr, setInstallmentCountStr] = useState('1');
  const [interestRateStr, setInterestRateStr] = useState('');

  const categoryKind = direction === 'payable' ? 'expense' : 'income';

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

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

  const totalAmountMinor = totalAmount ? toMinorUnits(Number(totalAmount.replace(',', '.'))) : 0;
  const installmentCount = Math.max(1, Math.min(60, parseInt(installmentCountStr, 10) || 1));
  // Faiz oranı yalnızca kredi eklerken ve birden fazla taksitte istenir; TUTAR alanı bu
  // durumda anaparayı temsil eder, taksitler azalan bakiye üzerinden hesaplanır ve
  // obligation'ın toplamı anapara+toplam faiz olur.
  const showInterestField = !isEditing && documentType === 'kredi' && installmentCount > 1;
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

      if (isEditing) {
        const obligation = await updateObligation(id, {
          direction,
          document_type: documentType,
          title: title.trim(),
          due_date: dueDate,
          counterparty_id: counterpartyId,
          account_id: accountId,
          category_id: categoryId,
          bank_code: bankCodeForType,
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
        due_date: dueDate,
        counterparty_id: counterpartyId,
        account_id: accountId,
        category_id: categoryId,
        bank_code: bankCodeForType,
      });

      if (installments.length > 0) {
        await createInstallmentPlan({
          workspaceId: activeWorkspaceId,
          obligationId: obligation.id,
          totalAmountMinor: obligationTotalMinor,
          installments,
        });
      }

      await syncObligationReminder(activeWorkspaceId, obligation);

      return obligation;
    },
    onSuccess: () => {
      // Aynı Fabric çakışmasını önlemek için önce geri dönülür, önbellek
      // geçersizleştirme bir sonraki etkileşim turuna ertelenir.
      router.back();
      InteractionManager.runAfterInteractions(() => {
        if (activeWorkspaceId) {
          queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'obligations'] });
        }
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await cancelObligationReminder(id as string);
      await deleteObligation(id as string);
    },
    onSuccess: () => {
      // Bu ekrana genelde /obligations/[id] detay sayfasından gelinir; oraya
      // router.back() ile dönmek, ['obligation', id] önbelleği tazelenene kadar
      // (veya hiç) az önce silinen kaydı göstermeye devam ediyordu. Silinen bir
      // kaydın detayına dönmek yerine doğrudan listeye çıkılır.
      // Navigasyon önce, önbellek geçersizleştirme sonra (bir sonraki etkileşim
      // turunda) yapılır — aksi halde bu, silme onayı Alert'inin native dismiss
      // animasyonuyla aynı anda çalışıp Fabric'i çökertiyor (bkz. obligations/[id].tsx
      // PaymentForm onSuccess'teki aynı düzeltme).
      router.replace('/(tabs)/hareketler');
      InteractionManager.runAfterInteractions(() => {
        if (activeWorkspaceId) {
          queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'obligations'] });
        }
        queryClient.removeQueries({ queryKey: ['obligation', id] });
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

  const canSubmit = !!title.trim() && totalAmountMinor > 0 && !!documentType;

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

            <Row gap="xs">
              {DIRECTIONS.map((option) => {
                const selected = option.value === direction;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      setDirection(option.value);
                      setCategoryId(null);
                    }}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: theme.spacing.sm,
                      borderRadius: theme.radius.input,
                      backgroundColor: selected ? theme.colors.brandPrimary : theme.colors.surfacePrimary,
                    }}
                  >
                    <Text
                      variant="body"
                      style={{ color: selected ? theme.colors.brandPrimaryText : theme.colors.textPrimary }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                BAŞLIK
              </Text>
              <TextField placeholder="Örn. Ocak ayı kira çeki" value={title} onChangeText={setTitle} />
            </Stack>

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                TUTAR
              </Text>
              {isEditing && hasInstallments ? (
                <Text variant="body" color="textSecondary">
                  {formatMinorAmount(totalAmountMinor)} — taksit planı olan kayıtlarda tutar düzenlenemez.
                </Text>
              ) : (
                <TextField
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                  value={totalAmount}
                  onChangeText={setTotalAmount}
                />
              )}
            </Stack>

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                {!isEditing && installmentCount > 1 ? 'İLK VADE' : 'VADE'}
              </Text>
              <TextField placeholder="YYYY-AA-GG" value={dueDate} onChangeText={setDueDate} />
            </Stack>

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

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                BELGE TÜRÜ
              </Text>
              <DocumentTypePicker selectedId={documentType} onSelect={setDocumentType} />
            </Stack>

            {documentType && BANK_DOCUMENT_TYPES.has(documentType) ? (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  BANKA (İSTEĞE BAĞLI)
                </Text>
                <BankPicker selectedId={bankCode} onSelect={setBankCode} />
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
                HESAP (İSTEĞE BAĞLI)
              </Text>
              {(accountsQuery.data ?? []).length === 0 ? (
                <Text variant="body" color="textSecondary">
                  Önce Hesaplar&apos;dan bir hesap ekleyin.
                </Text>
              ) : (
                <AccountPicker accounts={accountsQuery.data ?? []} selectedId={accountId} onSelect={setAccountId} />
              )}
            </Stack>

            {isEditing ? null : (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  TAKSİT SAYISI
                </Text>
                <TextField
                  placeholder="1"
                  keyboardType="number-pad"
                  value={installmentCountStr}
                  onChangeText={setInstallmentCountStr}
                />
              </Stack>
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
                  TUTAR alanı anaparadır; taksitler azalan bakiye üzerinden hesaplanır (banka kredisi gibi).
                </Text>
              </Stack>
            ) : null}

            {installmentPreview.length > 0 ? (
              <Stack gap="xs">
                <Text variant="caption" color="textSecondary">
                  TAKSİT ÖNİZLEME
                </Text>
                <Stack gap="xxs" style={{ backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.widget, padding: theme.spacing.md }}>
                  {installmentPreview.map((item) => (
                    <Row key={item.installmentNumber} align="center">
                      <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
                        {item.installmentNumber}. taksit — {item.dueDate}
                      </Text>
                      <Text variant="body" tabular>
                        {formatMinorAmount(item.amountMinor)}
                      </Text>
                    </Row>
                  ))}
                </Stack>
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
