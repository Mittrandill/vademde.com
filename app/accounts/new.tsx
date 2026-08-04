import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, Pressable, Row, Stack, Text, TextField } from '@/components/primitives';
import { BankPicker } from '@/components/finance/BankPicker';
import { createAccount, getAccount, updateAccount, type Account } from '@/features/accounts/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { toMinorUnits } from '@/utils/money';
import { formatIbanInput, isValidIbanFormat, normalizeIban } from '@/utils/iban';
import { queryKeys } from '@/services/queryKeys';
import { syncCreditCardStatementReminder } from '@/services/creditCardReminders';

const TYPES: Array<{ value: Account['type']; label: string }> = [
  { value: 'cash', label: 'Kasa' },
  { value: 'bank', label: 'Banka' },
  { value: 'wallet', label: 'Cüzdan' },
  { value: 'credit_card', label: 'Kredi Kartı' },
];

// Ayın gerçek gün sayısını aşan (ör. 30 Şubat) bir kesim/ödeme günü girilmesin —
// ay sonuna doğru clampCreditCardReminders (services/creditCardReminders.ts) bunu
// zaten tolere eder ama form seviyesinde de saçma bir değer engellenir.
function isValidDayOfMonth(value: string): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 31;
}

export default function NewAccountScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { id, type: typeParam } = useLocalSearchParams<{ id?: string; type?: string }>();
  const isEditing = !!id;
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>(
    TYPES.some((t) => t.value === typeParam) ? (typeParam as Account['type']) : 'cash'
  );
  const [bankCode, setBankCode] = useState<string | null>(null);
  const [iban, setIban] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [statementDay, setStatementDay] = useState('');
  const [paymentDueDay, setPaymentDueDay] = useState('');
  const [cardLastFour, setCardLastFour] = useState('');
  const [initialized, setInitialized] = useState(false);
  const isCreditCard = type === 'credit_card';

  const accountQuery = useQuery({
    queryKey: ['account', id, 'edit'],
    queryFn: () => getAccount(id as string),
    enabled: isEditing,
  });

  useEffect(() => {
    const account = accountQuery.data;
    if (!account || initialized) return;
    setName(account.name);
    setType(account.type as Account['type']);
    setBankCode(account.bank_code);
    setIban(account.iban ?? '');
    setOpeningBalance((account.opening_balance_minor / 100).toFixed(2).replace('.', ','));
    setStatementDay(account.statement_day != null ? String(account.statement_day) : '');
    setPaymentDueDay(account.payment_due_day != null ? String(account.payment_due_day) : '');
    setCardLastFour(account.card_last_four ?? '');
    setInitialized(true);
  }, [accountQuery.data, initialized]);

  const normalizedIban = normalizeIban(iban);
  const ibanHasError = normalizedIban.length > 0 && !isValidIbanFormat(normalizedIban);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        type,
        bank_code: type === 'bank' || isCreditCard ? bankCode : null,
        iban: type === 'bank' && normalizedIban ? normalizedIban : null,
        opening_balance_minor: openingBalance ? toMinorUnits(Number(openingBalance.replace(',', '.'))) : 0,
        statement_day: isCreditCard && statementDay ? Number(statementDay) : null,
        payment_due_day: isCreditCard && paymentDueDay ? Number(paymentDueDay) : null,
        card_last_four: isCreditCard && cardLastFour ? cardLastFour : null,
      };
      return isEditing
        ? updateAccount(id as string, payload)
        : createAccount({ workspace_id: activeWorkspaceId as string, ...payload });
    },
    onSuccess: (account) => {
      if (activeWorkspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts(activeWorkspaceId) });
        queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'account-balances'] });
        if (isCreditCard) {
          syncCreditCardStatementReminder(activeWorkspaceId, account).catch(() => {});
        }
      }
      if (isEditing) {
        queryClient.invalidateQueries({ queryKey: ['account', id] });
      }
      router.back();
    },
  });

  const statementDayHasError = statementDay.length > 0 && !isValidDayOfMonth(statementDay);
  const paymentDueDayHasError = paymentDueDay.length > 0 && !isValidDayOfMonth(paymentDueDay);
  const cardLastFourHasError = cardLastFour.length > 0 && !/^\d{4}$/.test(cardLastFour);
  const canSubmit =
    !!name.trim() &&
    !statementDayHasError &&
    !paymentDueDayHasError &&
    !cardLastFourHasError &&
    (!isCreditCard || isValidDayOfMonth(statementDay));

  function handleSubmit() {
    if (!canSubmit) return;
    if (!isEditing && !activeWorkspaceId) return;
    saveMutation.mutate();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.screenEdge.standard }}
        >
        <Stack gap="lg">
          <Row align="center">
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
            </Pressable>
            <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
              {isEditing ? 'Hesabı Düzenle' : 'Yeni Hesap'}
            </Text>
          </Row>

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              HESAP ADI
            </Text>
            <TextField placeholder="Örn. Nakit Kasa" value={name} onChangeText={setName} />
          </Stack>

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              HESAP TÜRÜ
            </Text>
            <Row gap="xs">
              {TYPES.map((option) => {
                const selected = option.value === type;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setType(option.value)}
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
                      numberOfLines={1}
                      style={{ color: selected ? theme.colors.brandPrimaryText : theme.colors.textPrimary }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
          </Stack>

          {type === 'bank' || isCreditCard ? (
            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                BANKA (İSTEĞE BAĞLI)
              </Text>
              <BankPicker selectedId={bankCode} onSelect={setBankCode} />
            </Stack>
          ) : null}

          {type === 'bank' ? (
            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                IBAN (İSTEĞE BAĞLI)
              </Text>
              <TextField
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                value={iban}
                onChangeText={(value) => setIban(formatIbanInput(value))}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={32}
              />
              {ibanHasError ? (
                <Text variant="caption" color="danger">
                  IBAN "TR" ile başlamalı ve 26 karakter olmalı.
                </Text>
              ) : null}
            </Stack>
          ) : null}

          {isCreditCard ? (
            <>
              <Row gap="sm">
                <Stack gap="sm" style={{ flex: 1 }}>
                  <Text variant="caption" color="textSecondary">
                    HESAP KESİM GÜNÜ
                  </Text>
                  <TextField
                    placeholder="Örn. 15"
                    keyboardType="number-pad"
                    maxLength={2}
                    value={statementDay}
                    onChangeText={setStatementDay}
                  />
                  {statementDayHasError ? (
                    <Text variant="caption" color="danger">
                      1-31 arası bir gün girin.
                    </Text>
                  ) : null}
                </Stack>
                <Stack gap="sm" style={{ flex: 1 }}>
                  <Text variant="caption" color="textSecondary">
                    SON ÖDEME GÜNÜ (İSTEĞE BAĞLI)
                  </Text>
                  <TextField
                    placeholder="Örn. 5"
                    keyboardType="number-pad"
                    maxLength={2}
                    value={paymentDueDay}
                    onChangeText={setPaymentDueDay}
                  />
                  {paymentDueDayHasError ? (
                    <Text variant="caption" color="danger">
                      1-31 arası bir gün girin.
                    </Text>
                  ) : null}
                </Stack>
              </Row>
              <Text variant="caption" color="textSecondary">
                Hesap kesiminden son ödeme gününe kadar ekstre yükleme hatırlatması gönderilir.
              </Text>

              <Stack gap="sm">
                <Text variant="caption" color="textSecondary">
                  KART SON 4 HANE (İSTEĞE BAĞLI)
                </Text>
                <TextField
                  placeholder="0000"
                  keyboardType="number-pad"
                  maxLength={4}
                  value={cardLastFour}
                  onChangeText={(value) => setCardLastFour(value.replace(/[^0-9]/g, ''))}
                />
                {cardLastFourHasError ? (
                  <Text variant="caption" color="danger">
                    4 haneli rakam girin.
                  </Text>
                ) : null}
                <Text variant="caption" color="textSecondary">
                  Güvenlik nedeniyle yalnızca son 4 hane saklanır, tam kart numarası hiçbir zaman istenmez.
                </Text>
              </Stack>
            </>
          ) : null}

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              {isCreditCard ? 'GÜNCEL KART BORCU (İSTEĞE BAĞLI)' : 'AÇILIŞ BAKİYESİ (İSTEĞE BAĞLI)'}
            </Text>
            <TextField
              placeholder="0,00"
              keyboardType="decimal-pad"
              value={openingBalance}
              onChangeText={setOpeningBalance}
            />
            {isCreditCard ? (
              <Text variant="caption" color="textSecondary">
                Kartta şu an borcunuz varsa buraya girin (ör. 2.500,00). Bu tutar diğer hesapların toplam
                bakiyesine dahil edilmez, yalnızca bilgi amaçlıdır.
              </Text>
            ) : null}
          </Stack>

          {saveMutation.error ? (
            <Text variant="caption" color="danger">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Hesap kaydedilemedi'}
            </Text>
          ) : null}

          <Button
            label={isEditing ? 'Güncelle' : 'Hesabı Kaydet'}
            onPress={handleSubmit}
            loading={saveMutation.isPending}
            disabled={!canSubmit}
          />
        </Stack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
