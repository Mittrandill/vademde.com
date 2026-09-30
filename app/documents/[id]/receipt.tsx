import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { withAlpha } from '@/theme/colors';
import { AmountField, Button, Card, DateField, Pressable, Row, SegmentedControl, Stack, Text } from '@/components/primitives';
import { AccountPicker } from '@/components/finance/AccountPicker';
import { CounterpartyPicker } from '@/components/finance/CounterpartyPicker';
import {
  discardDocument,
  getDocument,
  getDocumentWarnings,
  getSignedUrl,
  markDocumentConfirmed,
} from '@/features/documents/api';
import { createAccount, listAccounts } from '@/features/accounts/api';
import { listCounterparties, createCounterparty } from '@/features/counterparties/api';
import { recordPayment } from '@/features/payments/api';
import { createTransaction } from '@/features/transactions/api';
import {
  findReceiptMatches,
  normalizeName,
  useDocumentArchiveAccess,
  type ReceiptMatch,
} from '@/features/receipts/api';
import { BANKS, resolveBankFromDocument } from '@/features/banks/banks';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatAmountInput, formatMinorAmount, parseAmountToMinor } from '@/utils/money';
import { isValidIbanFormat, normalizeIban } from '@/utils/iban';
import { queryKeys, invalidatePaymentRelatedQueries } from '@/services/queryKeys';
import { showErrorAlert, showSaveSuccess } from '@/utils/alerts';

// docs/04-ocr-belge-isleme.md §7.7 ve docs/09-kullanici-akislari.md "Dekont eşleştirme" —
// taranan belge bir banka dekontu olduğunda kredi/fiş gibi bir "sonuç ekranı": okunan alanlar,
// mevcut borç/alacak için eşleşme önerisi ve tek onay. Hiçbir kayıt kullanıcı "Ödeme olarak
// kaydet"e basmadan oluşmaz (docs/00 kural 1).

type MoneyDirection = 'expense' | 'income';

const DIRECTIONS: { key: MoneyDirection; label: string }[] = [
  { key: 'expense', label: 'Yaptığım Ödeme' },
  { key: 'income', label: 'Aldığım Ödeme' },
];

const TRANSFER_TYPE_LABEL: Record<string, string> = {
  havale: 'Havale',
  eft: 'EFT',
  fast: 'FAST',
  diger: 'Diğer',
};

interface ReceiptSummary {
  bankName?: string | null;
  senderName?: string | null;
  senderIban?: string | null;
  recipientName?: string | null;
  recipientIban?: string | null;
  transferType?: string | null;
  referenceNo?: string | null;
  description?: string | null;
  feeMinor?: number | null;
  transactionDateTime?: string | null;
}

function isoDatePart(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return match ? match[0] : null;
}

export default function ReceiptResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const archive = useDocumentArchiveAccess();

  const documentQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.document(activeWorkspaceId, id) : ['document', 'disabled'],
    queryFn: () => getDocument(id),
    enabled: !!activeWorkspaceId && !!id,
  });
  const document = documentQuery.data;
  const summary = (document?.extracted_summary as { receipt?: ReceiptSummary } | null)?.receipt ?? null;

  const warningsQuery = useQuery({
    queryKey: ['document-warnings', id],
    queryFn: () => getDocumentWarnings(id),
    enabled: !!id,
  });
  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });
  const counterpartiesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.counterparties(activeWorkspaceId) : ['counterparties', 'disabled'],
    queryFn: () => listCounterparties(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const [initialized, setInitialized] = useState(false);
  const [direction, setDirection] = useState<MoneyDirection>('expense');
  const [amount, setAmount] = useState('');
  const [dateStr, setDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState<string | null>(null);
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [counterpartyResolved, setCounterpartyResolved] = useState(false);
  // 'none' = eşleşme yok, bağımsız hareket olarak kaydet. Aksi halde seçilen borç/alacağın id'si.
  const [selectedMatch, setSelectedMatch] = useState<string | 'none' | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!document || initialized) return;
    setDirection(document.direction === 'income' ? 'income' : 'expense');
    setAmount(
      formatAmountInput(((document.total_amount_minor ?? 0) / 100).toFixed(2).replace('.', ','))
    );
    setDateStr(
      isoDatePart(summary?.transactionDateTime) ?? isoDatePart(document.issue_date) ?? new Date().toISOString().slice(0, 10)
    );
    setInitialized(true);
  }, [document, summary, initialized]);

  // Önizleme yalnızca dosya saklandıysa vardır (Plus). Ücretsiz planda ham dosya OCR sonrası
  // silinir; imzalı adres alınamaz ve önizleme sessizce atlanır.
  useEffect(() => {
    if (!document || !document.mime_type.startsWith('image/') || document.retain_original === false) return;
    getSignedUrl(document.storage_path)
      .then(setImageUrl)
      .catch(() => setImageUrl(null));
  }, [document]);

  const currency = document?.currency_code ?? 'TRY';
  const amountMinor = parseAmountToMinor(amount);
  const counterpartyName = useMemo(() => {
    if (!document) return null;
    return document.counterparty_name ?? (direction === 'expense' ? summary?.recipientName : summary?.senderName) ?? null;
  }, [document, summary, direction]);

  // Dekontta hangi taraf "biz"iz? Ödemede GÖNDEREN, tahsilatta ALICI — o tarafın IBAN'ı/banka
  // adı bizim hesabımızın bankasıdır. Kayıtlı hesaplarda o bankadan hiçbiri yoksa kullanıcı
  // her seferinde bir sonraki adımda hesap ekleme akışını manuel bulmak zorunda kalıyordu —
  // burada doğrudan önerilir.
  const ownSideIban = summary ? (direction === 'expense' ? summary.senderIban : summary.recipientIban) : null;
  const ownSideBankCode = useMemo(() => {
    if (!summary) return null;
    return resolveBankFromDocument({ bankName: summary.bankName ?? null, iban: ownSideIban ?? null });
  }, [summary, ownSideIban]);
  const hasMatchingBankAccount = ownSideBankCode
    ? (accountsQuery.data ?? []).some((a) => a.bank_code === ownSideBankCode)
    : true;
  const ownSideBankName = ownSideBankCode ? (BANKS.find((b) => b.code === ownSideBankCode)?.name ?? null) : null;

  // Kullanıcı "banka hesabımı elle eklettirmesin" dedi — IBAN ve banka zaten OCR'dan
  // okunduğundan, kayıtlı hesap yoksa formu doldurtmak yerine hesap doğrudan burada
  // oluşturulur ve HESAP alanında otomatik seçilir (bkz. aşağıdaki banner, review.tsx'teki
  // quickAddCardMutation ile aynı desen).
  const quickAddBankAccountMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !ownSideBankCode) throw new Error('Banka bulunamadı');
      const normalizedIban = ownSideIban ? normalizeIban(ownSideIban) : '';
      const account = await createAccount({
        workspace_id: activeWorkspaceId,
        name: ownSideBankName ?? 'Banka Hesabı',
        type: 'bank',
        bank_code: ownSideBankCode,
        iban: isValidIbanFormat(normalizedIban) ? normalizedIban : null,
        currency_code: 'TRY',
      });
      return account;
    },
    onSuccess: (account) => {
      if (activeWorkspaceId) queryClient.invalidateQueries({ queryKey: queryKeys.accounts(activeWorkspaceId) });
      setAccountId(account.id);
    },
    onError: (error) => showErrorAlert(error),
  });

  // docs/04-ocr-belge-isleme.md §6.6 ile aynı desen (bkz. app/documents/[id]/review.tsx) —
  // dekonttaki isim mevcut bir cariyle TEK ve belirsiz olmayan bir eşleşme kuruyorsa önceden
  // seçilir. Eşleşme yoksa kullanıcı aşağıdaki KİŞİ/FİRMA alanından mevcut bir cariyle eşleştirir
  // ya da "Ali Kaya" gibi hiç kayıtlı olmayan bir isim için yeni bir cari oluşturur — faturada/
  // fişte OCR'ın önerdiği isimle aynı şekilde (bkz. saveMutation, DB'ye yalnızca kayıt onaylanınca yazar).
  useEffect(() => {
    if (!counterpartyName || !counterpartiesQuery.isSuccess || counterpartyResolved) return;
    setCounterpartyResolved(true);
    const target = normalizeName(counterpartyName);
    if (!target) return;
    const exact = counterpartiesQuery.data.find((c) => normalizeName(c.name) === target);
    if (exact) {
      setCounterpartyId(exact.id);
      return;
    }
    if (target.length < 3) return;
    const similar = counterpartiesQuery.data.filter((c) => {
      const normalizedName = normalizeName(c.name);
      return normalizedName.length >= 3 && (normalizedName.includes(target) || target.includes(normalizedName));
    });
    if (similar.length === 1) setCounterpartyId(similar[0]!.id);
  }, [counterpartyName, counterpartiesQuery.isSuccess, counterpartiesQuery.data, counterpartyResolved]);

  const matchesQuery = useQuery({
    queryKey: ['receipt-matches', id, direction, amountMinor, counterpartyId, counterpartyName],
    queryFn: () =>
      findReceiptMatches({
        workspaceId: activeWorkspaceId as string,
        direction,
        amountMinor: amountMinor as number,
        counterpartyId,
        counterpartyName,
      }),
    enabled: !!activeWorkspaceId && !!document && amountMinor !== null && amountMinor > 0,
  });
  // Farklı para birimindeki bir borca TL dekontu yazmak anlamsız; aynı birimdekiler önerilir.
  const matches: ReceiptMatch[] = useMemo(
    () => (matchesQuery.data ?? []).filter((m) => m.obligation.currency_code === currency),
    [matchesQuery.data, currency]
  );

  // En güçlü öneri varsayılan seçili gelir; kullanıcı başka birini ya da "eşleşme yok"u seçebilir.
  useEffect(() => {
    if (selectedMatch !== null || matchesQuery.isPending) return;
    setSelectedMatch(matches[0]?.obligation.id ?? 'none');
  }, [matches, matchesQuery.isPending, selectedMatch]);

  const activeMatch = matches.find((m) => m.obligation.id === selectedMatch) ?? null;
  const payCapMinor = activeMatch
    ? (activeMatch.installment?.remaining_amount_minor ?? activeMatch.obligation.remaining_amount_minor)
    : null;
  const exceedsRemaining = payCapMinor !== null && amountMinor !== null && amountMinor > payCapMinor;

  const selectableAccounts = (accountsQuery.data ?? []).filter((a) =>
    direction === 'expense' ? a.type !== 'pos' && a.type !== 'credit_card' : true
  );
  const isStandalone = selectedMatch === 'none' || (selectedMatch !== null && !activeMatch);

  // Dosya yalnızca Plus'ta ve gerçekten saklandıysa ödemeye bağlanır; aksi halde sunucu
  // tetikleyicisi (RECEIPT_ARCHIVE_PLAN_REQUIRED) bağlantıyı zaten reddederdi.
  const canLinkFile = archive.allowed && document?.retain_original !== false;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !document) throw new Error('Belge yüklenemedi');
      if (amountMinor === null || amountMinor <= 0) throw new Error('Tutar okunamadı, kontrol edin');
      const parsedDate = new Date(dateStr);
      if (Number.isNaN(parsedDate.getTime())) throw new Error('Tarih okunamadı, kontrol edin');
      const paidAt = parsedDate.toISOString();

      if (activeMatch) {
        const obligation = activeMatch.obligation;
        await recordPayment({
          workspace_id: activeWorkspaceId,
          obligation_id: obligation.id,
          installment_id: activeMatch.installment?.id ?? null,
          account_id: accountId,
          amount_minor: Math.min(amountMinor, payCapMinor ?? amountMinor),
          paid_at: paidAt,
          receipt_document_id: canLinkFile ? document.id : null,
          obligationDirection: obligation.direction as 'payable' | 'receivable',
          obligationTitle: obligation.title,
          obligationCategoryId: obligation.category_id,
          obligationCounterpartyId: obligation.counterparty_id,
          obligationCurrencyCode: obligation.currency_code,
        });
        await markDocumentConfirmed(document.id, { obligationId: obligation.id });
        return { obligationId: obligation.id };
      }

      if (!accountId) throw new Error('Hareketi kaydetmek için bir hesap seçin');
      // KİŞİ/FİRMA alanından kullanıcı zaten bir cariyle eşleştiyse (elle ya da otomatik) o
      // kullanılır. Eşleşmediyse ve OCR bir isim okuduysa (ör. "Ali Kaya" kayıtlı değil), bu
      // isimle yeni bir cari — faturada/fişte olduğu gibi (bkz. app/documents/[id]/review.tsx
      // confirmMutation) — ancak kayıt gerçekten onaylanırken oluşturulur; iptal edilen bir
      // dekont tarama sahipsiz cari biriktirmesin diye önceden değil, burada açılır. Ne bir
      // borç eşleşmesi ne de kayıtlı bir cari varsa bu, o kişiyle bağımsız bir hareket/ön ödeme
      // olarak kaydedilmiş olur (docs/00 kural 3 — cari yine de workspace'e bağlı kalır).
      let resolvedCounterpartyId = counterpartyId;
      if (!resolvedCounterpartyId && counterpartyName) {
        const created = await createCounterparty({
          workspace_id: activeWorkspaceId,
          name: counterpartyName.trim(),
          type: 'individual',
        });
        resolvedCounterpartyId = created.id;
        queryClient.invalidateQueries({ queryKey: queryKeys.counterparties(activeWorkspaceId) });
      }
      const transaction = await createTransaction({
        workspace_id: activeWorkspaceId,
        account_id: accountId,
        direction,
        counterparty_id: resolvedCounterpartyId,
        amount_minor: amountMinor,
        currency_code: currency,
        occurred_at: paidAt,
        description: summary?.description?.trim() || counterpartyName || 'Banka dekontu',
      });
      await markDocumentConfirmed(document.id, { transactionId: transaction.id });
      return { obligationId: null };
    },
    onSuccess: ({ obligationId }) => {
      showSaveSuccess(
        obligationId ? 'Ödeme kaydedildi ve dekont ödemeye eklendi.' : 'Hareket kaydedildi.',
        () => {
          if (obligationId) router.replace({ pathname: '/obligations/[id]', params: { id: obligationId } });
          else router.replace('/(tabs)/hareketler');
        },
        () => {
          if (activeWorkspaceId) invalidatePaymentRelatedQueries(queryClient, activeWorkspaceId);
        }
      );
    },
    onError: (error) => showErrorAlert(error),
  });

  const discardMutation = useMutation({
    mutationFn: () => discardDocument(id),
    onSuccess: () => router.back(),
    onError: (error) => showErrorAlert(error),
  });

  function confirmDiscard() {
    Alert.alert('Dekont silinsin mi?', 'Taranan dekont kaydedilmeden atılır.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => discardMutation.mutate() },
    ]);
  }

  if (documentQuery.isPending || !document) {
    return (
      <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack align="center" style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.brandPrimary} />
        </Stack>
      </SafeAreaView>
    );
  }

  const detailRows: { label: string; value: string | null | undefined }[] = [
    { label: 'GÖNDEREN', value: [summary?.senderName, summary?.senderIban].filter(Boolean).join('\n') },
    { label: 'ALICI', value: [summary?.recipientName, summary?.recipientIban].filter(Boolean).join('\n') },
    { label: 'BANKA', value: summary?.bankName },
    {
      label: 'İŞLEM TÜRÜ',
      value: summary?.transferType ? (TRANSFER_TYPE_LABEL[summary.transferType] ?? summary.transferType) : null,
    },
    { label: 'REFERANS NO', value: summary?.referenceNo },
    { label: 'AÇIKLAMA', value: summary?.description },
    {
      label: 'MASRAF',
      value: summary?.feeMinor ? formatMinorAmount(summary.feeMinor, currency) : null,
    },
  ].filter((row) => !!row.value);

  const warnings = warningsQuery.data ?? [];
  const isPdf = document.mime_type === 'application/pdf';

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.screenEdge.standard, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
        >
          <Row align="center">
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
            </Pressable>
            <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
              Dekontu Onayla
            </Text>
          </Row>

          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: '100%', height: 200, borderRadius: theme.radius.widget }}
              resizeMode="cover"
            />
          ) : isPdf && canLinkFile ? (
            <Row
              gap="sm"
              align="center"
              style={{ height: 72, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.widget, backgroundColor: theme.colors.surfacePrimary }}
            >
              <Ionicons name="document-text" size={28} color={theme.colors.accentViolet} />
              <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                {document.file_name}
              </Text>
            </Row>
          ) : null}

          {document.overall_confidence !== null && document.overall_confidence !== undefined ? (
            <Text variant="caption" color="textSecondary">
              Genel güven: %{Math.round((document.overall_confidence ?? 0) * 100)}
            </Text>
          ) : null}

          {!archive.allowed && !archive.isLoading ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/paywall')}>
              <Card style={{ borderWidth: 1, borderColor: withAlpha(theme.colors.brandPrimary, 0.4) }}>
                <Row gap="sm" align="center">
                  <Ionicons name="lock-closed-outline" size={20} color={theme.colors.brandPrimary} />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="cardTitle">Dekontu arşivle</Text>
                    <Text variant="caption" color="textSecondary">
                      Plus ile dekont ödemeye eklenir, arşivde saklanır ve tek dokunuşla açılır. Şimdilik yalnızca ödeme kaydedilir.
                    </Text>
                  </Stack>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </Row>
              </Card>
            </Pressable>
          ) : null}

          {warnings.length > 0 ? (
            <Card style={{ borderWidth: 1, borderColor: withAlpha(theme.colors.danger, 0.4) }}>
              <Stack gap="xs">
                <Row gap="xs" align="center">
                  <Ionicons name="alert-circle-outline" size={18} color={theme.colors.danger} />
                  <Text variant="cardTitle" style={{ color: theme.colors.danger }}>
                    Kontrol edilmesi gerekenler
                  </Text>
                </Row>
                {warnings.map((warning) => (
                  <Text key={warning} variant="caption" color="textSecondary">
                    • {warning}
                  </Text>
                ))}
              </Stack>
            </Card>
          ) : null}

          {detailRows.length > 0 ? (
            <Card>
              <Stack gap="md">
                {detailRows.map((row) => (
                  <Stack key={row.label} gap="xxs">
                    <Text variant="caption" color="textSecondary">
                      {row.label}
                    </Text>
                    <Text variant="body">{row.value}</Text>
                  </Stack>
                ))}
              </Stack>
            </Card>
          ) : null}

          <Stack gap="xs">
            <Text variant="caption" color="textSecondary">
              YÖN
            </Text>
            <SegmentedControl
              options={DIRECTIONS}
              value={direction}
              onChange={(value) => {
                setDirection(value);
                setSelectedMatch(null);
                setAccountId(null);
                setCounterpartyId(null);
                setCounterpartyResolved(false);
              }}
            />
          </Stack>

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              TUTAR
            </Text>
            <AmountField value={amount} onChangeText={(value) => { setAmount(value); setSelectedMatch(null); }} />
          </Stack>

          <DateField label="İŞLEM TARİHİ" value={dateStr} onChangeText={setDateStr} />

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              KİŞİ / FİRMA
            </Text>
            {activeWorkspaceId ? (
              <CounterpartyPicker
                workspaceId={activeWorkspaceId}
                counterparties={counterpartiesQuery.data ?? []}
                selectedId={counterpartyId}
                onSelect={(value) => {
                  setCounterpartyId(value);
                  setSelectedMatch(null);
                }}
              />
            ) : null}
          </Stack>

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              BU ÖDEME HANGİ KAYITLA İLGİLİ?
            </Text>
            {matchesQuery.isPending ? (
              <ActivityIndicator color={theme.colors.brandPrimary} />
            ) : (
              <>
                {matches.map((match) => (
                  <MatchOption
                    key={match.obligation.id}
                    match={match}
                    currency={currency}
                    selected={selectedMatch === match.obligation.id}
                    onSelect={() => setSelectedMatch(match.obligation.id)}
                  />
                ))}
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isStandalone }}
                  onPress={() => setSelectedMatch('none')}
                >
                  <Card
                    elevated={isStandalone}
                    style={{ borderWidth: 1.5, borderColor: isStandalone ? theme.colors.brandPrimary : theme.colors.border }}
                  >
                    <Row gap="sm" align="center">
                      <RadioDot selected={isStandalone} />
                      <Stack gap="xxs" style={{ flex: 1 }}>
                        <Text variant="cardTitle">Eşleşme yok</Text>
                        <Text variant="caption" color="textSecondary">
                          {counterpartyId
                            ? `Bu kişiyle açık bir borç/alacak yok; ön ödeme olarak bağımsız bir ${direction === 'expense' ? 'gider' : 'gelir'} kaydedilir.`
                            : `Bağımsız bir ${direction === 'expense' ? 'gider' : 'gelir'} hareketi olarak kaydet`}
                        </Text>
                      </Stack>
                    </Row>
                  </Card>
                </Pressable>
                {matches.length === 0 ? (
                  <Text variant="caption" color="textSecondary">
                    Bu dekonta uyan açık bir borç/alacak bulunamadı.
                  </Text>
                ) : null}
              </>
            )}
            {exceedsRemaining && payCapMinor !== null ? (
              <Text variant="caption" style={{ color: theme.colors.danger }}>
                Tutar kalan tutardan fazla; en fazla {formatMinorAmount(payCapMinor, currency)} kaydedilir.
              </Text>
            ) : null}
          </Stack>

          {ownSideBankCode && !hasMatchingBankAccount && !accountsQuery.isPending ? (
            <Pressable
              accessibilityRole="button"
              disabled={quickAddBankAccountMutation.isPending}
              onPress={() => quickAddBankAccountMutation.mutate()}
            >
              <Card style={{ borderWidth: 1, borderColor: withAlpha(theme.colors.brandPrimary, 0.4) }}>
                <Row gap="sm" align="center">
                  <Ionicons name="business-outline" size={20} color={theme.colors.brandPrimary} />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="cardTitle">
                      {quickAddBankAccountMutation.isPending
                        ? 'Hesap ekleniyor…'
                        : `${ownSideBankName ?? 'Bu banka'} hesabınız kayıtlı değil`}
                    </Text>
                    <Text variant="caption" color="textSecondary">
                      {ownSideIban
                        ? 'Dekonttaki IBAN ve banka ile otomatik eklensin, elle girmeyin.'
                        : 'Dekonttaki bankayla otomatik eklensin, elle girmeyin.'}
                    </Text>
                  </Stack>
                  {quickAddBankAccountMutation.isPending ? (
                    <ActivityIndicator color={theme.colors.brandPrimary} />
                  ) : (
                    <Text variant="cardTitle" style={{ color: theme.colors.brandPrimary }}>
                      Ekle
                    </Text>
                  )}
                </Row>
              </Card>
            </Pressable>
          ) : null}

          {selectableAccounts.length > 0 ? (
            // Bir dekont zaten gerçekleşmiş bir banka hareketidir — eşleşen bir borca ödeme
            // olarak yazılırken de HESAP hiçbir zaman isteğe bağlı olmamalı: aksi halde
            // recordPayment hesapsız çağrılır (bkz. features/payments/api.ts), borç kapanır
            // ama hiçbir hesabın bakiyesi değişmez ve Hareketler'de hiç görünmez.
            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                HESAP
              </Text>
              <AccountPicker accounts={selectableAccounts} selectedId={accountId} onSelect={setAccountId} />
            </Stack>
          ) : null}

          {saveMutation.error ? (
            <Text variant="caption" color="danger">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Kayıt oluşturulamadı'}
            </Text>
          ) : null}

          <Stack gap="sm">
            <Button
              label="Ödeme olarak kaydet"
              onPress={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              disabled={
                selectedMatch === null ||
                amountMinor === null ||
                amountMinor <= 0 ||
                (selectableAccounts.length > 0 && !accountId)
              }
            />
            <Text variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>
              Siz onaylamadan hiçbir kayıt oluşmaz.
            </Text>
            <Button label="İptal Et" variant="danger" onPress={confirmDiscard} loading={discardMutation.isPending} />
          </Stack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RadioDot({ selected }: { selected: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {selected ? (
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.brandPrimary }} />
      ) : null}
    </View>
  );
}

function MatchOption({
  match,
  currency,
  selected,
  onSelect,
}: {
  match: ReceiptMatch;
  currency: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const theme = useTheme();
  const { obligation, installment } = match;
  const remaining = installment ? installment.remaining_amount_minor : obligation.remaining_amount_minor;

  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onSelect}>
      <Card
        elevated={selected}
        style={{ borderWidth: 1.5, borderColor: selected ? theme.colors.brandPrimary : theme.colors.border }}
      >
        <Row gap="sm" align="center">
          <RadioDot selected={selected} />
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle" numberOfLines={1}>
              {obligation.title}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {obligation.counterparty?.name ? `${obligation.counterparty.name} · ` : ''}
              {installment ? `${installment.installment_number}. taksit · ` : ''}
              {match.reasons.join(' · ')}
            </Text>
          </Stack>
          <Stack gap="xxs" align="flex-end">
            <Text variant="cardTitle" tabular>
              {formatMinorAmount(remaining, currency)}
            </Text>
            <Text variant="caption" color="textSecondary">
              kalan
            </Text>
          </Stack>
        </Row>
      </Card>
    </Pressable>
  );
}
