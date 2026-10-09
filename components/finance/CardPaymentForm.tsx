import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { BigAmountInput, DateField, FieldGroup, Pill, Row, Text } from '@/components/primitives';
import { TransferAccounts } from './TransferAccounts';
import { getAccountBalances } from '@/features/reports/api';
import { recordCardPayment } from '@/features/payments/api';
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
  const [amount, setAmount] = useState(
    formatAmountInput((Math.max(currentDebtMinor, 0) / 100).toFixed(2).replace('.', ','))
  );
  const [amountTouched, setAmountTouched] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState(new Date().toISOString().slice(0, 10));

  const mutation = useMutation({
    mutationFn: () => {
      if (!accountId || !amount) throw new Error('Eksik alan var');
      const amountMinor = parseAmountToMinor(amount);
      if (amountMinor === null || amountMinor <= 0) throw new Error('Tutar okunamadı, kontrol edin');
      const parsedDate = new Date(dateStr);
      if (Number.isNaN(parsedDate.getTime())) throw new Error('Tarih okunamadı, kontrol edin');

      return recordCardPayment({
        workspaceId,
        cardAccountId,
        sourceAccountId: accountId,
        amountMinor,
        currencyCode,
        paidAt: parsedDate.toISOString(),
      });
    },
    onSuccess,
  });

  const debtText = formatAmountInput((Math.max(currentDebtMinor, 0) / 100).toFixed(2).replace('.', ','));
  const selectedAccount = sourceAccounts.find((a) => a.id === accountId) ?? null;

  const balancesQuery = useQuery({
    queryKey: queryKeys.reportAccountBalances(workspaceId),
    queryFn: () => getAccountBalances(workspaceId),
  });
  const balances = new Map((balancesQuery.data ?? []).map((b) => [b.accountId, b.balanceMinor]));
  balances.set(cardAccountId, currentDebtMinor);

  const canSubmit = !!amount && !!selectedAccount && !mutation.isPending;

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
