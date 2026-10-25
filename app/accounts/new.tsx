import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useExitGuard } from '@/utils/useExitGuard';
import { useReflowKey } from '@/services/reflow';
import { AmountField, FieldGroup, Pressable, ScrollableTabs, Text, TextField } from '@/components/primitives';
import { monoFamily } from '@/theme/typography';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { BankPicker } from '@/components/finance/BankPicker';
import { ValueUnitPicker } from '@/components/finance/ValueUnitPicker';
import { createAccount, getAccount, updateAccount, type Account } from '@/features/accounts/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatAmountInput, parseAmount, parseAmountToMinor, parseValueUnitAmountToMinor } from '@/utils/money';
import { getValueUnit } from '@/features/valueUnits/units';
import { formatIbanInput, isValidIbanFormat, normalizeIban } from '@/utils/iban';
import { showSaveSuccess, showErrorAlert, friendlyErrorMessage } from '@/utils/alerts';
import { queryKeys } from '@/services/queryKeys';
import { syncCreditCardStatementReminder } from '@/services/creditCardReminders';
import { amountPlaceholder, getInputDecimalSeparator } from '@/i18n/format';
import { t } from '@/i18n';
import { ACCOUNT_TYPE_LABEL } from '@/features/accounts/accountTypes';

const TYPES: Array<{ value: Account['type']; readonly label: string }> = (
  ['cash', 'bank', 'wallet', 'credit_card', 'pos'] as const
).map((value) => ({
  value,
  get label() {
    return ACCOUNT_TYPE_LABEL[value];
  },
}));

// Ayın gerçek gün sayısını aşan (ör. 30 Şubat) bir kesim/ödeme günü girilmesin —
// ay sonuna doğru clampCreditCardReminders (services/creditCardReminders.ts) bunu
// zaten tolere eder ama form seviyesinde de saçma bir değer engellenir.
function isValidDayOfMonth(value: string): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 31;
}

export default function NewAccountScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const queryClient = useQueryClient();
  const { id, type: typeParam } = useLocalSearchParams<{ id?: string; type?: string }>();
  const isEditing = !!id;
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [name, setName] = useState('');
  const { allowExit } = useExitGuard(!isEditing && name.trim() !== '');
  const [type, setType] = useState<Account['type']>(
    TYPES.some((option) => option.value === typeParam) ? (typeParam as Account['type']) : 'cash'
  );
  const [bankCode, setBankCode] = useState<string | null>(null);
  const [iban, setIban] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [statementDay, setStatementDay] = useState('');
  const [paymentDueDay, setPaymentDueDay] = useState('');
  const [cardLastFour, setCardLastFour] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [overdraftLimit, setOverdraftLimit] = useState('');
  const [valueUnitCode, setValueUnitCode] = useState('TRY');
  const [commissionRate, setCommissionRate] = useState('');
  const [initialized, setInitialized] = useState(false);
  const isCreditCard = type === 'credit_card';
  const isBank = type === 'bank';
  const isCash = type === 'cash';
  const isPos = type === 'pos';

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
    const openingUnitPrecision = getValueUnit(account.currency_code).precision;
    setOpeningBalance(
      formatAmountInput(
        (account.opening_balance_minor / 10 ** openingUnitPrecision).toFixed(openingUnitPrecision).replace('.', getInputDecimalSeparator()),
        openingUnitPrecision
      )
    );
    setStatementDay(account.statement_day != null ? String(account.statement_day) : '');
    setPaymentDueDay(account.payment_due_day != null ? String(account.payment_due_day) : '');
    setCardLastFour(account.card_last_four ?? '');
    setCreditLimit(
      account.credit_limit_minor != null
        ? formatAmountInput((account.credit_limit_minor / 100).toFixed(2).replace('.', getInputDecimalSeparator()))
        : ''
    );
    setOverdraftLimit(
      account.overdraft_limit_minor != null
        ? formatAmountInput((account.overdraft_limit_minor / 100).toFixed(2).replace('.', getInputDecimalSeparator()))
        : ''
    );
    setValueUnitCode(account.currency_code);
    setCommissionRate(
      account.pos_commission_rate != null ? String(account.pos_commission_rate).replace('.', getInputDecimalSeparator()) : ''
    );
    setInitialized(true);
  }, [accountQuery.data, initialized]);

  const openingPrecision = getValueUnit(valueUnitCode).precision;
  const normalizedIban = normalizeIban(iban);
  const ibanHasError = normalizedIban.length > 0 && !isValidIbanFormat(normalizedIban);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        type,
        bank_code: type === 'bank' || isCreditCard || isPos ? bankCode : null,
        iban: type === 'bank' && normalizedIban ? normalizedIban : null,
        opening_balance_minor: parseValueUnitAmountToMinor(openingBalance, isCash ? valueUnitCode : 'TRY') ?? 0,
        statement_day: isCreditCard && statementDay ? Number(statementDay) : null,
        payment_due_day: isCreditCard && paymentDueDay ? Number(paymentDueDay) : null,
        card_last_four: isCreditCard && cardLastFour ? cardLastFour : null,
        credit_limit_minor: isCreditCard ? parseAmountToMinor(creditLimit) : null,
        overdraft_limit_minor: isBank ? parseAmountToMinor(overdraftLimit) : null,
        currency_code: isCash ? valueUnitCode : 'TRY',
        pos_commission_rate: isPos ? parseAmount(commissionRate) : null,
      };
      return isEditing
        ? updateAccount(id as string, payload)
        : createAccount({ workspace_id: activeWorkspaceId as string, ...payload });
    },
    onSuccess: (account) => {
      allowExit();
      showSaveSuccess(
        isEditing ? t('accounts.form.updated') : t('accounts.form.created'),
        () => router.back(),
        () => {
          if (activeWorkspaceId) {
            queryClient.invalidateQueries({ queryKey: queryKeys.accounts(activeWorkspaceId) });
            queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'account-balances'] });
            // Kesim günü/açılış borcu değişince kart borcu da değişir (bkz. utils/cardDebt.ts); raporlar
            // ayrı anahtarda tutulur.
            queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'reports'] });
            if (isCreditCard) {
              syncCreditCardStatementReminder(activeWorkspaceId, account).catch(() => {});
            }
          }
          if (isEditing) {
            queryClient.invalidateQueries({ queryKey: ['account', id] });
          }
        }
      );
    },
    onError: (error) => showErrorAlert(error),
  });

  const statementDayHasError = statementDay.length > 0 && !isValidDayOfMonth(statementDay);
  const paymentDueDayHasError = paymentDueDay.length > 0 && !isValidDayOfMonth(paymentDueDay);
  // İki gün alanı yan yana durur; her biri kendi hata mesajını basarsa satırlar farklı
  // yükseklikte kalıp hizası kayardı (bkz. TextField'daki invalid notu) — bu yüzden
  // border kırmızıya döner ama mesaj satırın altında ortak, tek bir yerde toplanır.
  const dayErrorMessage =
    statementDayHasError && paymentDueDayHasError
      ? t('accounts.form.dayErrorBoth')
      : statementDayHasError
        ? t('accounts.form.dayErrorStatement')
        : paymentDueDayHasError
          ? t('accounts.form.dayErrorDue')
          : null;
  const cardLastFourHasError = cardLastFour.length > 0 && !/^\d{4}$/.test(cardLastFour);
  const parsedCommissionRate = commissionRate.trim() ? parseAmount(commissionRate) : null;
  const commissionRateHasError =
    commissionRate.trim().length > 0 && (parsedCommissionRate === null || parsedCommissionRate < 0 || parsedCommissionRate > 100);
  const canSubmit =
    !!name.trim() &&
    !statementDayHasError &&
    !paymentDueDayHasError &&
    !cardLastFourHasError &&
    !commissionRateHasError &&
    (!isCreditCard || isValidDayOfMonth(statementDay));

  function handleSubmit() {
    if (!canSubmit) return;
    if (!isEditing && !activeWorkspaceId) return;
    saveMutation.mutate();
  }

  const openingBalanceIsNegative = openingBalance.trim().startsWith('-');
  function toggleOpeningBalanceSign() {
    setOpeningBalance((prev) => {
      const trimmed = prev.trim();
      if (trimmed.startsWith('-')) return trimmed.slice(1);
      return trimmed ? `-${trimmed}` : '-';
    });
  }

  const foot = (text: string, color: 'textSecondary' | 'danger' = 'textSecondary') => (
    <Text variant="caption" color={color} style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      {text}
    </Text>
  );

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.screenEdge.standard, paddingBottom: theme.spacing.xxl }}
        >
          <ScreenHeader
            inline
            title={isEditing ? t('accounts.form.editTitle') : t('accounts.form.newTitle')}
            leftLabel={{ label: t('common.cancel'), onPress: () => router.back() }}
            rightLabel={{ label: isEditing ? t('accounts.form.update') : t('common.save'), bold: true, disabled: !canSubmit || saveMutation.isPending, onPress: handleSubmit }}
          />

          <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xs }}>
            <ScrollableTabs
              tabs={TYPES.map((option) => ({ key: option.value, label: option.label }))}
              activeKey={type}
              onChange={(key) => setType(key as Account['type'])}
            />

            {isCreditCard ? (
              <>
                <View>
                  <FieldGroup>
                    <TextField label={t('accounts.form.cardName')} placeholder={t('accounts.form.cardNamePlaceholder')} value={name} onChangeText={setName} />
                    <BankPicker selectedId={bankCode} onSelect={setBankCode} label={t('accounts.form.bank')} />
                    <TextField
                      label={t('accounts.form.lastFour')}
                      placeholder="0000"
                      keyboardType="number-pad"
                      maxLength={4}
                      value={cardLastFour}
                      onChangeText={(value) => setCardLastFour(value.replace(/[^0-9]/g, ''))}
                      error={cardLastFourHasError ? t('accounts.form.lastFourError') : undefined}
                    />
                  </FieldGroup>
                  {foot(t('accounts.form.lastFourHint'))}
                </View>

                <View style={{ gap: 10 }}>
                  <Text variant="label" color="textSecondary">
                    {t('accounts.form.cycle')}
                  </Text>
                  <View>
                    <FieldGroup>
                      <TextField
                        label={t('accounts.form.statementDay')}
                        placeholder={t('accounts.form.statementDayPlaceholder')}
                        keyboardType="number-pad"
                        maxLength={2}
                        value={statementDay}
                        onChangeText={setStatementDay}
                        invalid={statementDayHasError}
                      />
                      <TextField
                        label={t('accounts.form.dueDay')}
                        placeholder={t('accounts.form.dueDayPlaceholder')}
                        keyboardType="number-pad"
                        maxLength={2}
                        value={paymentDueDay}
                        onChangeText={setPaymentDueDay}
                        invalid={paymentDueDayHasError}
                      />
                    </FieldGroup>
                    {foot(
                      dayErrorMessage ??
                        t('accounts.form.cycleHint'),
                      dayErrorMessage ? 'danger' : 'textSecondary'
                    )}
                  </View>
                </View>

                <View style={{ gap: 10 }}>
                  <Text variant="label" color="textSecondary">
                    {t('accounts.form.limitAndBalance')}
                  </Text>
                  <View>
                    <FieldGroup>
                      <AmountField label={t('accounts.form.creditLimit')} placeholder={amountPlaceholder()} value={creditLimit} onChangeText={setCreditLimit} />
                      <AmountField label={t('accounts.form.currentCardDebt')} placeholder={amountPlaceholder()} value={openingBalance} onChangeText={setOpeningBalance} />
                    </FieldGroup>
                    {foot(
                      t('accounts.form.limitHint')
                    )}
                  </View>
                </View>
              </>
            ) : isPos ? (
              <View>
                <FieldGroup>
                  <TextField label={t('accounts.form.accountName')} placeholder={t('accounts.form.posPlaceholder')} value={name} onChangeText={setName} />
                  <BankPicker selectedId={bankCode} onSelect={setBankCode} label={t('accounts.form.bank')} />
                  <TextField
                    label={t('accounts.form.commission')}
                    placeholder={t('accounts.form.commissionPlaceholder')}
                    keyboardType="decimal-pad"
                    value={commissionRate}
                    onChangeText={setCommissionRate}
                    error={commissionRateHasError ? t('accounts.form.commissionError') : undefined}
                  />
                  <AmountField label={t('accounts.form.openingBalanceOptional')} placeholder={amountPlaceholder()} value={openingBalance} onChangeText={setOpeningBalance} />
                </FieldGroup>
                {foot(t('accounts.form.posHint'))}
              </View>
            ) : (
              <>
                <View>
                  <FieldGroup>
                    {type === 'bank' ? <BankPicker selectedId={bankCode} onSelect={setBankCode} label={t('accounts.form.bank')} /> : null}
                    <TextField
                      label={t('accounts.form.accountName')}
                      placeholder={isCash ? t('accounts.form.cashPlaceholder') : t('accounts.form.bankPlaceholder')}
                      value={name}
                      onChangeText={setName}
                    />
                    {isCash ? <ValueUnitPicker selectedId={valueUnitCode} onSelect={setValueUnitCode} label={t('accounts.form.unit')} /> : null}
                    {type === 'bank' ? (
                      <TextField
                        label={t('accounts.form.iban')}
                        placeholder="TR00 0000 0000 0000 0000 0000 00"
                        value={iban}
                        onChangeText={(value) => setIban(formatIbanInput(value))}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={32}
                        style={{ fontFamily: monoFamily, fontSize: 16 }}
                        error={ibanHasError ? t('accounts.form.ibanError') : undefined}
                      />
                    ) : null}
                    {isBank ? (
                      <AmountField label={t('accounts.form.overdraft')} placeholder={amountPlaceholder()} value={overdraftLimit} onChangeText={setOverdraftLimit} />
                    ) : null}
                    {isBank ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <AmountField label={t('accounts.form.openingBalance')} placeholder={`₺${amountPlaceholder()}`} value={openingBalance} onChangeText={setOpeningBalance} />
                        </View>
                        {/* Sayısal klavyede eksi tuşu yok; KMH kullanan hesabın başlangıç bakiyesi eksi olabildiği için
                            işaret klavyeden bağımsız bu düğmeyle değiştirilir. */}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={openingBalanceIsNegative ? t('accounts.form.makePositive') : t('accounts.form.makeNegative')}
                          onPress={toggleOpeningBalanceSign}
                          style={{
                            width: 40,
                            height: 40,
                            marginRight: 12,
                            borderRadius: 20,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: openingBalanceIsNegative ? 'rgba(255,98,92,0.14)' : theme.colors.fill,
                          }}
                        >
                          <Text style={{ fontSize: 20, fontWeight: '600', color: openingBalanceIsNegative ? theme.colors.danger : theme.colors.textPrimary }}>
                            {openingBalanceIsNegative ? '−' : '+'}
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      <AmountField
                        label={t('accounts.form.openingBalanceOptional')}
                        placeholder={isCash && openingPrecision === 0 ? '1' : amountPlaceholder()}
                        precision={isCash ? openingPrecision : 2}
                        value={openingBalance}
                        onChangeText={setOpeningBalance}
                      />
                    )}
                  </FieldGroup>
                  {isBank
                    ? foot(t('accounts.form.bankHint'))
                    : isCash
                      ? foot(t('accounts.form.cashHint'))
                      : null}
                </View>
              </>
            )}

            {saveMutation.error ? (
              <Text variant="caption" color="danger">
                {friendlyErrorMessage(saveMutation.error, t('accounts.form.saveFailed'))}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
