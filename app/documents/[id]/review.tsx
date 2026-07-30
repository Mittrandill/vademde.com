import { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
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
  getSignedUrl,
  markDocumentConfirmed,
} from '@/features/documents/api';
import { listAccounts } from '@/features/accounts/api';
import { listCategories } from '@/features/categories/api';
import { listCounterparties, createCounterparty } from '@/features/counterparties/api';
import { createObligation, createInstallmentPlan } from '@/features/obligations/api';
import { createTransaction, createTransfer } from '@/features/transactions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount, toMinorUnits } from '@/utils/money';
import { DOCUMENT_TYPE_LABEL, BANK_DOCUMENT_TYPES } from '@/features/obligations/documentTypes';
import { queryKeys } from '@/services/queryKeys';
import { syncObligationReminder } from '@/services/notifications';

type Direction = 'payable' | 'receivable' | 'income' | 'expense';

const DIRECTIONS: { key: Direction; label: string }[] = [
  { key: 'payable', label: 'Ben Ödeyeceğim' },
  { key: 'receivable', label: 'Ben Tahsil Edeceğim' },
  { key: 'expense', label: 'Gerçekleşmiş Gider' },
  { key: 'income', label: 'Gerçekleşmiş Gelir' },
];

const LOW_CONFIDENCE_THRESHOLD = 0.7;

export default function DocumentReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [counterpartyResolved, setCounterpartyResolved] = useState(false);
  const [direction, setDirection] = useState<Direction>('payable');
  const [documentType, setDocumentType] = useState<string | null>(null);
  const [bankCode, setBankCode] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);

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
  const installmentItems = (lineItemsQuery.data ?? []).filter((item) => item.kind === 'installment');

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
    setDocumentType(document.document_type);
    setAmount(document.total_amount_minor ? (document.total_amount_minor / 100).toFixed(2).replace('.', ',') : '');
    setDueDate(document.due_date ?? document.issue_date ?? '');
    setDocumentNumber(document.document_number ?? '');
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
  // eşleşme yoksa yeni kişi/firma otomatik oluşturulur.
  useEffect(() => {
    const document = documentQuery.data;
    if (!document?.counterparty_name || !activeWorkspaceId || !counterpartiesQuery.isSuccess || counterpartyResolved) {
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

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId) throw new Error('Çalışma alanı bulunamadı');
      const amountMinor = toMinorUnits(Number(amount.replace(',', '.')));

      if (direction === 'payable' || direction === 'receivable') {
        if (!documentType) throw new Error('Belge türü seçin');
        const obligation = await createObligation({
          workspace_id: activeWorkspaceId,
          direction,
          document_type: documentType,
          title: title.trim() || 'Belge',
          total_amount_minor: amountMinor,
          due_date: dueDate || null,
          counterparty_id: counterpartyId,
          account_id: accountId,
          category_id: categoryId,
          bank_code: BANK_DOCUMENT_TYPES.has(documentType) ? bankCode : null,
          notes: documentNumber.trim() ? `Belge no: ${documentNumber.trim()}` : null,
        });
        // docs/12-mvp-kabul-kriterleri.md — "Kredi ödeme planından taksitler ayrı satırlar olarak oluşturulur."
        // Tutarlar (yuvarlama vb. nedenlerle) tam uyuşmazsa taksit planı atlanır; borç tek kalem
        // olarak kalır ve kullanıcı sonradan manuel taksitlendirebilir — asla tutarsız veri yazılmaz.
        if (documentType === 'kredi' && installmentItems.length > 0) {
          try {
            await createInstallmentPlan({
              workspaceId: activeWorkspaceId,
              obligationId: obligation.id,
              totalAmountMinor: amountMinor,
              installments: installmentItems.map((item, index) => ({
                installmentNumber: item.sort_order || index + 1,
                dueDate: item.occurred_at ?? (dueDate || new Date().toISOString().slice(0, 10)),
                amountMinor: item.amount_minor,
              })),
            });
          } catch {
            // sessizce atla — obligation tek kalem borç olarak kalır.
          }
        }

        await markDocumentConfirmed(id as string, { obligationId: obligation.id });
        await syncObligationReminder(activeWorkspaceId, obligation);
        return;
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
              occurred_at: dueDate ? new Date(dueDate).toISOString() : new Date().toISOString(),
              description: title.trim() || null,
            })
          : null;
      if (transaction) {
        await markDocumentConfirmed(id as string, { transactionId: transaction.id });
      }
    },
    onSuccess: () => {
      if (activeWorkspaceId) {
        queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'obligations'] });
        queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'transactions'] });
        queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'financial_documents'] });
      }
      router.replace('/(tabs)/hareketler');
    },
  });

  const discardMutation = useMutation({
    mutationFn: () => discardDocument(id as string),
    onSuccess: () => {
      if (activeWorkspaceId) {
        queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'financial_documents'] });
      }
      router.back();
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
    ((direction === 'payable' || direction === 'receivable') ? !!documentType : !!accountId);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard }}>
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
                  TUTAR
                </Text>
                <LowConfidenceHint fieldName="totalAmount" />
              </Row>
              <TextField keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
            </Stack>

            <Stack gap="sm">
              <Row align="center">
                <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                  VADE
                </Text>
                <LowConfidenceHint fieldName="dueDate" />
              </Row>
              <TextField placeholder="YYYY-AA-GG" value={dueDate} onChangeText={setDueDate} />
            </Stack>

            {(direction === 'payable' || direction === 'receivable') && (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  BELGE TÜRÜ
                </Text>
                <DocumentTypePicker selectedId={documentType} onSelect={setDocumentType} />
              </Stack>
            )}

            {documentType === 'kredi' && installmentItems.length > 0 ? (
              <Stack
                gap="xs"
                style={{
                  backgroundColor: theme.colors.surfacePrimary,
                  borderRadius: theme.radius.widget,
                  padding: theme.spacing.md,
                }}
              >
                <Text variant="caption" color="textSecondary">
                  {installmentItems.length} TAKSİT OTOMATİK OLUŞTURULACAK
                </Text>
                {installmentItems.map((item) => (
                  <Row key={item.id} style={{ justifyContent: 'space-between' }}>
                    <Text variant="body" color="textSecondary">
                      {item.description ?? `${item.sort_order}. Taksit`} — {item.occurred_at ?? '—'}
                    </Text>
                    <Text variant="body" tabular>
                      {formatMinorAmount(item.amount_minor, document.currency_code ?? 'TRY')}
                    </Text>
                  </Row>
                ))}
              </Stack>
            ) : null}

            {documentType && BANK_DOCUMENT_TYPES.has(documentType) ? (
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  BANKA (İSTEĞE BAĞLI)
                </Text>
                <BankPicker selectedId={bankCode} onSelect={setBankCode} />
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
