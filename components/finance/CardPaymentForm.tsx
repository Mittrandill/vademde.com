import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { AmountField, Button, DateField, Pressable, Row, Stack, Text } from '@/components/primitives';
import { AccountPicker } from './AccountPicker';
import { recordCardPayment } from '@/features/payments/api';
import type { Account } from '@/features/accounts/api';
import { formatAmountInput, parseAmountToMinor } from '@/utils/money';

export interface CardPaymentFormProps {
  workspaceId: string;
  cardAccountId: string;
  cardAccountName: string;
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Stack gap="lg" style={{ flex: 1, padding: theme.screenEdge.standard }}>
        <Row align="center">
          <Text variant="pageTitle" style={{ flex: 1 }}>
            Kart Borcu Öde
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
          </Pressable>
        </Row>

        <Text variant="body" color="textSecondary">
          {cardAccountName}
        </Text>

        <Stack gap="sm">
          <Text variant="caption" color="textSecondary">
            TUTAR (TL)
          </Text>
          <AmountField placeholder="0,00" value={amount} onChangeText={setAmount} />
        </Stack>

        <DateField label="ÖDEME TARİHİ" value={dateStr} onChangeText={setDateStr} />

        <Stack gap="sm">
          <Text variant="caption" color="textSecondary">
            KAYNAK HESAP
          </Text>
          {sourceAccounts.length === 0 ? (
            <Text variant="body" color="textSecondary">
              Önce Hesaplar&apos;dan bir kasa/banka hesabı ekleyin.
            </Text>
          ) : (
            <AccountPicker accounts={sourceAccounts} selectedId={accountId} onSelect={setAccountId} />
          )}
        </Stack>

        {mutation.error ? (
          <Text variant="caption" color="danger">
            {mutation.error instanceof Error ? mutation.error.message : 'Ödeme kaydedilemedi'}
          </Text>
        ) : null}

        <View style={{ flex: 1 }} />

        <Button
          label="Kaydet"
          onPress={() => mutation.mutate()}
          loading={mutation.isPending}
          disabled={!amount || !accountId}
        />
      </Stack>
    </SafeAreaView>
  );
}
