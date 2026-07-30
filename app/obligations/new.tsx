import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, Pressable, Row, Stack, Text, TextField } from '@/components/primitives';
import { CategoryPicker } from '@/components/finance/CategoryPicker';
import { AccountPicker } from '@/components/finance/AccountPicker';
import { CounterpartyPicker } from '@/components/finance/CounterpartyPicker';
import { DocumentTypePicker } from '@/components/finance/DocumentTypePicker';
import { listAccounts } from '@/features/accounts/api';
import { listCategories } from '@/features/categories/api';
import { listCounterparties } from '@/features/counterparties/api';
import { createObligation, createInstallmentPlan } from '@/features/obligations/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { toMinorUnits, formatMinorAmount } from '@/utils/money';
import { buildEqualInstallments } from '@/utils/installmentPlan';
import { queryKeys } from '@/services/queryKeys';
import { syncObligationReminder } from '@/services/notifications';

type Direction = 'payable' | 'receivable';

const DIRECTIONS: Array<{ value: Direction; label: string }> = [
  { value: 'payable', label: 'Borç' },
  { value: 'receivable', label: 'Alacak' },
];

export default function NewObligationScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const [direction, setDirection] = useState<Direction>('payable');
  const [documentType, setDocumentType] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [installmentCountStr, setInstallmentCountStr] = useState('1');

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
  const installmentPreview =
    installmentCount > 1 && totalAmountMinor > 0
      ? buildEqualInstallments(totalAmountMinor, installmentCount, dueDate)
      : [];

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !title.trim() || !totalAmountMinor || !documentType) {
        throw new Error('Eksik alan var');
      }

      const obligation = await createObligation({
        workspace_id: activeWorkspaceId,
        direction,
        document_type: documentType,
        title: title.trim(),
        total_amount_minor: totalAmountMinor,
        due_date: dueDate,
        counterparty_id: counterpartyId,
        account_id: accountId,
        category_id: categoryId,
      });

      if (installmentCount > 1) {
        await createInstallmentPlan({
          workspaceId: activeWorkspaceId,
          obligationId: obligation.id,
          totalAmountMinor,
          installments: buildEqualInstallments(totalAmountMinor, installmentCount, dueDate),
        });
      }

      await syncObligationReminder(activeWorkspaceId, obligation);

      return obligation;
    },
    onSuccess: () => {
      if (activeWorkspaceId) {
        queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'obligations'] });
      }
      router.back();
    },
  });

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
                Yeni Borç / Alacak
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
              <TextField
                placeholder="0,00"
                keyboardType="decimal-pad"
                value={totalAmount}
                onChangeText={setTotalAmount}
              />
            </Stack>

            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                {installmentCount > 1 ? 'İLK VADE' : 'VADE'}
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
                  Önce Hesaplar'dan bir hesap ekleyin.
                </Text>
              ) : (
                <AccountPicker accounts={accountsQuery.data ?? []} selectedId={accountId} onSelect={setAccountId} />
              )}
            </Stack>

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

            {createMutation.error ? (
              <Text variant="caption" color="danger">
                {createMutation.error instanceof Error ? createMutation.error.message : 'Kayıt oluşturulamadı'}
              </Text>
            ) : null}

            <Button
              label="Kaydet"
              onPress={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={!canSubmit}
            />
          </Stack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
