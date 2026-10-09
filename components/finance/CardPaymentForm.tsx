import { useState } from 'react';
import { localIsoDate } from '@/features/obligations/api';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { BigAmountInput, Button, DateField, FieldGroup, Pill, Row, Text } from '@/components/primitives';
import { TransferAccounts } from './TransferAccounts';
import { getAccountBalances } from '@/features/reports/api';
import { acknowledgeCardPayment, loadStoredCardPayment, submitDurableCardPayment } from '@/features/payments/cardPaymentQueue';
import { useSession } from '@/features/auth/useSession';
import type { Account } from '@/features/accounts/api';
import { queryKeys } from '@/services/queryKeys';
import { formatAmountInput, formatMinorAmount, parseAmountToMinor } from '@/utils/money';

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
  sourceAccounts,
  onClose,
  onSuccess,
}: CardPaymentFormProps) {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id;
  const [amount, setAmount] = useState(
    formatAmountInput((Math.max(currentDebtMinor, 0) / 100).toFixed(2).replace('.', ','))
  );
  const [amountTouched, setAmountTouched] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState(localIsoDate());
  const storedQuery = useQuery({
    queryKey: ['card-payment-recovery', userId, workspaceId, cardAccountId],
    queryFn: () => loadStoredCardPayment(userId!, workspaceId, cardAccountId),
    enabled: !!userId,
    staleTime: 0,
    gcTime: 0,
    networkMode: 'always',
  });
  const stored = storedQuery.data;
  const newPayment = useMutation({
    mutationFn: () => acknowledgeCardPayment(userId!, workspaceId, cardAccountId),
    onSuccess: () => { void storedQuery.refetch(); },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!userId || !storedQuery.isSuccess || storedQuery.isFetching) throw new Error('Önce saklanan ödeme kontrol edilmeli');
      // Recovery always uses the original source, amount and date, not today's form defaults.
      if (stored) return submitDurableCardPayment(userId, stored.input);
      if (!accountId || !amount) throw new Error('Eksik alan var');
      const amountMinor = parseAmountToMinor(amount);
      if (amountMinor === null || amountMinor <= 0) throw new Error('Tutar okunamadı, kontrol edin');
      const parsedDate = new Date(dateStr);
      if (Number.isNaN(parsedDate.getTime())) throw new Error('Tarih okunamadı, kontrol edin');

      return submitDurableCardPayment(userId, {
        workspaceId,
        cardAccountId,
        sourceAccountId: accountId,
        amountMinor,
        currencyCode,
        paidAt: parsedDate.toISOString(),
      });
    },
    onSuccess,
    onError: () => { void storedQuery.refetch(); },
    networkMode: 'always',
  });

  const debtText = formatAmountInput((Math.max(currentDebtMinor, 0) / 100).toFixed(2).replace('.', ','));
  const selectedAccount = sourceAccounts.find((a) => a.id === accountId) ?? null;

  const balancesQuery = useQuery({
    queryKey: queryKeys.reportAccountBalances(workspaceId),
    queryFn: () => getAccountBalances(workspaceId),
  });
  const balances = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b.balanceMinor]));
  balances.set(cardAccountId, currentDebtMinor);

  const canSubmit = !!amount && !!selectedAccount && !!userId && storedQuery.isSuccess
    && !storedQuery.isFetching && !stored && !mutation.isPending && !newPayment.isPending;

  if (!userId || !storedQuery.isSuccess || storedQuery.isFetching || stored) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard, gap: theme.spacing.lg }}>
          <ScreenHeader inline title="Kart ödeme kontrolü" leftLabel={{ label: 'Kapat', onPress: onClose }} />
          {stored ? (
            <>
              <Text variant="cardTitle">{formatMinorAmount(stored.input.amountMinor, stored.input.currencyCode)}</Text>
              <Text variant="caption" color="textSecondary">{new Date(stored.input.paidAt).toLocaleDateString('tr-TR')} · {sourceAccounts.find((a) => a.id === stored.input.sourceAccountId)?.name ?? 'Önceki kaynak hesap'}</Text>
              <Text>{stored.state === 'confirmed'
                ? 'Önceki ödeme başarıyla kaydedildi. Aynı ödeme yeniden oluşturulmayacak.'
                : 'Önceki ödemenin sonucu belirsiz. Aynı kimlikle yeniden deneme, ödeme kaydedilmişse ikinci kayıt oluşturmaz; kaydedilmemişse özgün ödemeyi tamamlar.'}</Text>
              <Button label={stored.state === 'confirmed' ? 'Yeni ödeme başlat' : 'Aynı ödemeyi yeniden dene'}
                disabled={storedQuery.isFetching || !userId}
                loading={mutation.isPending || newPayment.isPending}
                onPress={() => stored.state === 'confirmed' ? newPayment.mutate() : mutation.mutate()} />
            </>
          ) : <Text>{storedQuery.isError ? 'Saklanan ödeme kontrol edilemedi. Kontrol tamamlanmadan yeni ödeme başlatılamaz.' : 'Saklanan ödeme kontrol ediliyor…'}</Text>}
          {storedQuery.isError ? <Button label="Tekrar kontrol et" onPress={() => { void storedQuery.refetch(); }} /> : null}
          {[storedQuery.error, mutation.error, newPayment.error].filter(Boolean).map((error, index) => (
            <Text key={index} variant="caption" color="danger">{error instanceof Error ? error.message : 'Ödeme kontrol edilemedi'}</Text>
          ))}
        </ScrollView>
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
                  setAmountTouched(true);
                }}
                symbol={currencyCode === 'TRY' ? '₺' : currencyCode === 'USD' ? '$' : currencyCode === 'EUR' ? '€' : undefined}
              />
              <Row gap="xs" style={{ justifyContent: 'center' }}>
                <Pill
                  label="Tamamı"
                  selected={!amountTouched}
                  onPress={() => {
                    setAmount(debtText);
                    setAmountTouched(false);
                  }}
                />
                <Pill label="Kısmi tutar" selected={amountTouched} onPress={() => setAmountTouched(true)} />
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
              {`${cardAccountName} güncel borcu ${formatMinorAmount(Math.max(currentDebtMinor, 0), currencyCode)}. Ödeme gelir ya da gider sayılmaz; kart borcunu düşürür.`}
            </Text>

            <FieldGroup>
              <DateField label="Tarih" value={dateStr} onChangeText={setDateStr} />
            </FieldGroup>

            {mutation.error ? (
              <Text variant="caption" color="danger">
                {mutation.error instanceof Error ? mutation.error.message : 'Ödeme kaydedilemedi'}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
