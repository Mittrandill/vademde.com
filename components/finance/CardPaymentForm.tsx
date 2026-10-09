import { useEffect, useRef, useState } from 'react';
import { localIsoDate } from '@/features/obligations/api';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { BigAmountInput, Button, DateField, FieldGroup, Pill, Row, Stack, Text } from '@/components/primitives';
import { TransferAccounts } from './TransferAccounts';
import { getAccountBalances } from '@/features/reports/api';
import { acknowledgeCardPayment, loadStoredCardPayment, submitDurableCardPayment } from '@/features/payments/cardPaymentQueue';
import { useSession } from '@/features/auth/useSession';
import type { Account } from '@/features/accounts/api';
import { queryKeys } from '@/services/queryKeys';
import { formatAmountInput, formatMinorAmount, parseAmountToMinor } from '@/utils/money';
import { friendlyErrorMessage, isNetworkError } from '@/utils/alerts';

export interface CardPaymentFormProps {
  workspaceId: string;
  cardAccountId: string;
  cardAccountName: string;
  /** Transfer satırında "Alan" olarak gösterilen kart hesabının kendisi. */
  cardAccount: Account;
  currencyCode: string;
  /** Formu güncel kart borcuyla önceden doldurur; kullanıcı tam, asgari veya herhangi bir
   * kısmi tutara serbestçe değiştirebilir. */
  currentDebtMinor: number;
  /** En son ekstreden ödenmesi gereken kalan (ekstre yoksa null). Varsa form bununla dolar —
   * bankalardaki gibi önce ekstre borcu önerilir, güncel borç ayrı bir seçenektir. */
  statementDebtMinor?: number | null;
  /** Kaynak hesap seçenekleri — çağıran taraf kredi kartı ve POS'u zaten dışarıda bırakır
   * (bkz. app/accounts/[id].tsx: bir kartın borcu başka bir kartla ödenemez). */
  sourceAccounts: Account[];
  onClose: () => void;
  onSuccess: () => void;
}

// Klasik kredi kartı ödemesi: kaynak hesaptan karta tek transfer (bkz.
// features/payments/api.ts recordCardPayment) — ekstre şartı yoktur, tutar serbesttir.
export function CardPaymentForm({
  workspaceId,
  cardAccountId,
  cardAccountName,
  cardAccount,
  currencyCode,
  currentDebtMinor,
  statementDebtMinor = null,
  sourceAccounts,
  onClose,
  onSuccess,
}: CardPaymentFormProps) {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id;
  const toInput = (minor: number) => formatAmountInput((Math.max(minor, 0) / 100).toFixed(2).replace('.', ','));
  const offerStatement = statementDebtMinor !== null && statementDebtMinor > 0 && statementDebtMinor !== currentDebtMinor;
  type AmountChoice = 'statement' | 'current' | 'custom';
  const [choice, setChoice] = useState<AmountChoice>(offerStatement ? 'statement' : 'current');
  const [amount, setAmount] = useState(toInput(offerStatement ? (statementDebtMinor as number) : currentDebtMinor));
  const [accountId, setAccountId] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState(localIsoDate());
  // Kart ödemesi kalıcı kuyrukta saklanır (bkz. cardPaymentQueue): yanıt kaybolursa aynı kimlikle
  // güvenle tekrarlanır. Teknik bir "kontrol" ekranı gösterilmez: kaydedilmiş ödeme sessizce
  // kapatılır, yarım kalan ödeme form açılınca bir kez otomatik tamamlanmaya çalışılır; yalnızca
  // bu da başarısız olursa sade bir "Tekrar dene" ekranı çıkar.
  const storedQuery = useQuery({
    queryKey: ['card-payment-recovery', userId, workspaceId, cardAccountId],
    queryFn: () => loadStoredCardPayment(userId!, workspaceId, cardAccountId),
    enabled: !!userId,
    staleTime: 0,
    gcTime: 0,
    networkMode: 'always',
  });
  const stored = storedQuery.data;
  const autoHandled = useRef(new Set<string>());
  const [recoveryError, setRecoveryError] = useState<unknown>(null);
  const [stuckId, setStuckId] = useState<string | null>(null);
  // Kaydet az önce başarısız olduysa, kuyruğa düşen aynı istek hemen otomatik tekrarlanmaz.
  const justFailed = useRef(false);
  const ackSilently = useMutation({
    mutationFn: () => acknowledgeCardPayment(userId!, workspaceId, cardAccountId),
    onSettled: () => { void storedQuery.refetch(); },
    networkMode: 'always',
  });
  const resume = useMutation({
    mutationFn: async () => {
      if (!userId || !stored) throw new Error('Tamamlanacak ödeme bulunamadı');
      await submitDurableCardPayment(userId, stored.input);
      autoHandled.current.add(`${stored.input.requestId}:confirmed`);
      await acknowledgeCardPayment(userId, workspaceId, cardAccountId).catch(() => undefined);
      return stored.input;
    },
    onSuccess: (input) => {
      setRecoveryError(null);
      Alert.alert('İşlem tamamlandı', `Bağlantı kesildiği için yarım kalan ${formatMinorAmount(input.amountMinor, input.currencyCode)} kart ödemesi kaydedildi.`);
    },
    onError: (error) => { setRecoveryError(error); if (stored) setStuckId(stored.input.requestId); },
    onSettled: () => { void storedQuery.refetch(); },
    networkMode: 'always',
  });
  useEffect(() => {
    if (!userId || !stored || storedQuery.isFetching) return;
    const key = `${stored.input.requestId}:${stored.state}`;
    if (autoHandled.current.has(key)) return;
    autoHandled.current.add(key);
    if (stored.state === 'confirmed') ackSilently.mutate();
    else if (!justFailed.current) resume.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, stored, storedQuery.isFetching]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!userId || !storedQuery.isSuccess || storedQuery.isFetching || stored) throw new Error('Önceki ödeme henüz tamamlanmadı');
      if (!accountId || !amount) throw new Error('Eksik alan var');
      const amountMinor = parseAmountToMinor(amount);
      if (amountMinor === null || amountMinor <= 0) throw new Error('Tutar okunamadı, kontrol edin');
      const parsedDate = new Date(dateStr);
      if (Number.isNaN(parsedDate.getTime())) throw new Error('Tarih okunamadı, kontrol edin');

      const saved = await submitDurableCardPayment(userId, {
        workspaceId,
        cardAccountId,
        sourceAccountId: accountId,
        amountMinor,
        currencyCode,
        paidAt: parsedDate.toISOString(),
      });
      await acknowledgeCardPayment(userId, workspaceId, cardAccountId).catch(() => undefined);
      return saved;
    },
    onSuccess,
    onError: async (error) => {
      // Ağ kesintisinde ödeme kuyrukta "yarım kalmış" durur; aynı istek hemen otomatik
      // tekrarlanmaz, sade "Tekrar dene" ekranı gösterilir.
      justFailed.current = true;
      const pending = (await storedQuery.refetch()).data;
      justFailed.current = false;
      if (pending?.state === 'pending') {
        autoHandled.current.add(`${pending.input.requestId}:pending`);
        setStuckId(pending.input.requestId);
        setRecoveryError(error);
      }
    },
    networkMode: 'always',
  });

  const selectedAccount = sourceAccounts.find((a) => a.id === accountId) ?? null;

  const balancesQuery = useQuery({
    queryKey: queryKeys.reportAccountBalances(workspaceId),
    queryFn: () => getAccountBalances(workspaceId),
  });
  const balances = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b.balanceMinor]));
  balances.set(cardAccountId, currentDebtMinor);

  const canSubmit = !!amount && !!selectedAccount && !!userId && storedQuery.isSuccess
    && !storedQuery.isFetching && !stored && !mutation.isPending;

  const stuck = stored?.state === 'pending' && stuckId === stored.input.requestId && !resume.isPending;
  if (storedQuery.isError || stuck) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard, gap: theme.spacing.lg }}>
          <ScreenHeader inline title={stuck ? 'Yarım kalan işlem' : 'Kart borcu öde'} leftLabel={{ label: 'Kapat', onPress: onClose }} />
          {stuck && stored ? (
            <>
              <Stack gap="xxs">
                <Text variant="cardTitle">Kart ödemesi · {formatMinorAmount(stored.input.amountMinor, stored.input.currencyCode)}</Text>
                <Text variant="caption" color="textSecondary">{new Date(stored.input.paidAt).toLocaleDateString('tr-TR')} · {sourceAccounts.find((a) => a.id === stored.input.sourceAccountId)?.name ?? 'Kaynak hesap'}</Text>
              </Stack>
              <Text>{!recoveryError || isNetworkError(recoveryError)
                ? 'Bağlantı kesildiği için bu ödeme tamamlanamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.'
                : friendlyErrorMessage(recoveryError, 'Bu ödeme tamamlanamadı. Lütfen tekrar deneyin.')}</Text>
              <Button label="Tekrar dene" onPress={() => resume.mutate()} />
            </>
          ) : (
            <>
              <Text>{friendlyErrorMessage(storedQuery.error, 'Ekran açılamadı. Lütfen tekrar deneyin.')}</Text>
              <Button label="Tekrar dene" onPress={() => { void storedQuery.refetch(); }} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }
  if (!userId || !storedQuery.isSuccess || stored) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.textSecondary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.screenEdge.standard, paddingBottom: theme.spacing.xxl }}
        >
          <ScreenHeader
            inline
            title="Kart borcu öde"
            leftLabel={{ label: 'Vazgeç', onPress: onClose }}
            rightLabel={{ label: 'Kaydet', bold: true, disabled: !canSubmit, onPress: () => mutation.mutate() }}
          />

          <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xs }}>
            <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
              <BigAmountInput
                value={amount}
                onChangeText={(value) => {
                  setAmount(value);
                  setChoice('custom');
                }}
                symbol={currencyCode === 'TRY' ? '₺' : currencyCode === 'USD' ? '$' : currencyCode === 'EUR' ? '€' : undefined}
              />
              <Row gap="xs" style={{ justifyContent: 'center' }}>
                {offerStatement ? (
                  <Pill
                    label="Ekstre borcu"
                    selected={choice === 'statement'}
                    onPress={() => {
                      setAmount(toInput(statementDebtMinor as number));
                      setChoice('statement');
                    }}
                  />
                ) : null}
                <Pill
                  label={offerStatement ? 'Güncel borç' : 'Tamamı'}
                  selected={choice === 'current'}
                  onPress={() => {
                    setAmount(toInput(currentDebtMinor));
                    setChoice('current');
                  }}
                />
                <Pill label="Kısmi tutar" selected={choice === 'custom'} onPress={() => setChoice('custom')} />
              </Row>
            </View>

            {sourceAccounts.length === 0 ? (
              <Text variant="caption" color="danger" style={{ textAlign: 'center' }}>
                Önce Hesaplar&apos;dan bir kasa/banka hesabı ekleyin.
              </Text>
            ) : (
              <TransferAccounts
                sourceAccounts={sourceAccounts}
                targetAccounts={[cardAccount]}
                fromId={accountId}
                toId={cardAccountId}
                onFromChange={setAccountId}
                onToChange={() => {}}
                onSwap={() => {}}
                canSwap={false}
                balances={balances}
              />
            )}

            <Text variant="caption" color="textSecondary" style={{ textAlign: 'center', paddingHorizontal: 30 }}>
              {`${cardAccountName} güncel borcu ${formatMinorAmount(Math.max(currentDebtMinor, 0), currencyCode)}${offerStatement ? `, ekstre borcu ${formatMinorAmount(statementDebtMinor as number, currencyCode)}` : ''}. Ödeme gelir ya da gider sayılmaz; kart borcunu düşürür.`}
            </Text>

            <FieldGroup>
              <DateField label="Tarih" value={dateStr} onChangeText={setDateStr} />
            </FieldGroup>

            {mutation.error ? (
              <Text variant="caption" color="danger">
                {friendlyErrorMessage(mutation.error, 'Ödeme kaydedilemedi')}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
