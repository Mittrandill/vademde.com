import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { AmountField, FieldGroup, Pressable, SegmentedControl, Text, TextField } from '@/components/primitives';
import { monoFamily } from '@/theme/typography';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { BankPicker } from '@/components/finance/BankPicker';
import { CreditCardVisual } from '@/components/finance/CreditCardVisual';
import { ValueUnitPicker } from '@/components/finance/ValueUnitPicker';
import { createAccount, getAccount, updateAccount, type Account } from '@/features/accounts/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatAmountInput, parseAmount, parseAmountToMinor, parseValueUnitAmountToMinor } from '@/utils/money';
import { getValueUnit } from '@/features/valueUnits/units';
import { formatIbanInput, isValidIbanFormat, normalizeIban } from '@/utils/iban';
import { showSaveSuccess, showErrorAlert } from '@/utils/alerts';
import { queryKeys } from '@/services/queryKeys';
import { syncCreditCardStatementReminder } from '@/services/creditCardReminders';

const TYPES: Array<{ value: Account['type']; label: string }> = [
  { value: 'cash', label: 'Kasa' },
  { value: 'bank', label: 'Banka' },
  { value: 'wallet', label: 'Cüzdan' },
  { value: 'credit_card', label: 'Kredi Kartı' },
  { value: 'pos', label: 'POS' },
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
  const reflowKey = useReflowKey();
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
        (account.opening_balance_minor / 10 ** openingUnitPrecision).toFixed(openingUnitPrecision).replace('.', ','),
        openingUnitPrecision
      )
    );
    setStatementDay(account.statement_day != null ? String(account.statement_day) : '');
    setPaymentDueDay(account.payment_due_day != null ? String(account.payment_due_day) : '');
    setCardLastFour(account.card_last_four ?? '');
    setCreditLimit(
      account.credit_limit_minor != null
        ? formatAmountInput((account.credit_limit_minor / 100).toFixed(2).replace('.', ','))
        : ''
    );
    setOverdraftLimit(
      account.overdraft_limit_minor != null
        ? formatAmountInput((account.overdraft_limit_minor / 100).toFixed(2).replace('.', ','))
        : ''
    );
    setValueUnitCode(account.currency_code);
    setCommissionRate(
      account.pos_commission_rate != null ? String(account.pos_commission_rate).replace('.', ',') : ''
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
      showSaveSuccess(
        isEditing ? 'Hesap başarıyla güncellendi.' : 'Hesap başarıyla oluşturuldu.',
        () => router.back(),
        () => {
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
      ? 'Kesim ve son ödeme günü 1-31 arası olmalı.'
      : statementDayHasError
        ? 'Hesap kesim günü 1-31 arası olmalı.'
        : paymentDueDayHasError
          ? 'Son ödeme günü 1-31 arası olmalı.'
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

  // Kredi kartı türü seçiliyken formun üstünde canlı güncellenen bir kart önizlemesi
  // gösterilir (Revolut/N26 tarzı "kartını oluştururken gör" hissi) — CreditCardVisual
  // zaten hesap detayında kullanılan gerçek bileşen, burada yalnızca taslak veriyle
  // besleniyor. Önizleme amaçlı olduğundan Account tipinin kullanılmayan alanları
  // (id, workspace_id vb.) kasıtlı olarak atlanır.
  const previewAccount = {
    name: name.trim() || 'Kart Sahibi',
    bank_code: bankCode,
    card_last_four: cardLastFour || null,
    statement_day: statementDay ? Number(statementDay) : null,
    payment_due_day: paymentDueDay ? Number(paymentDueDay) : null,
  } as Account;

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
            title={isEditing ? 'Hesabı düzenle' : 'Yeni hesap'}
            leftLabel={{ label: 'Vazgeç', onPress: () => router.back() }}
            rightLabel={{ label: isEditing ? 'Güncelle' : 'Kaydet', bold: true, disabled: !canSubmit || saveMutation.isPending, onPress: handleSubmit }}
          />

          <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xs }}>
            <SegmentedControl
              options={TYPES.map((t) => ({ key: t.value, label: t.label }))}
              value={type}
              onChange={setType}
              stretch
            />

            {isCreditCard ? <CreditCardVisual account={previewAccount} /> : null}

            {isCreditCard ? (
              <>
                <View>
                  <FieldGroup>
                    <TextField label="Kart adı" placeholder="Örn. Bonus Kartım" value={name} onChangeText={setName} />
                    <BankPicker selectedId={bankCode} onSelect={setBankCode} label="Banka" />
                    <TextField
                      label="Kart son 4 hane (isteğe bağlı)"
                      placeholder="0000"
                      keyboardType="number-pad"
                      maxLength={4}
                      value={cardLastFour}
                      onChangeText={(value) => setCardLastFour(value.replace(/[^0-9]/g, ''))}
                      error={cardLastFourHasError ? '4 haneli rakam girin.' : undefined}
                    />
                  </FieldGroup>
                  {foot('Güvenlik nedeniyle yalnızca son 4 hane saklanır, tam kart numarası hiçbir zaman istenmez.')}
                </View>

                <View style={{ gap: 10 }}>
                  <Text variant="label" color="textSecondary">
                    Kesim ve ödeme
                  </Text>
                  <View>
                    <FieldGroup>
                      <TextField
                        label="Hesap kesim günü"
                        placeholder="Örn. 15"
                        keyboardType="number-pad"
                        maxLength={2}
                        value={statementDay}
                        onChangeText={setStatementDay}
                        invalid={statementDayHasError}
                      />
                      <TextField
                        label="Son ödeme günü"
                        placeholder="Örn. 5"
                        keyboardType="number-pad"
                        maxLength={2}
                        value={paymentDueDay}
                        onChangeText={setPaymentDueDay}
                        invalid={paymentDueDayHasError}
                      />
                    </FieldGroup>
                    {foot(
                      dayErrorMessage ??
                        'Son ödeme günü isteğe bağlıdır. Hesap kesiminden son ödeme gününe kadar ekstre yükleme hatırlatması gönderilir.',
                      dayErrorMessage ? 'danger' : 'textSecondary'
                    )}
                  </View>
                </View>

                <View style={{ gap: 10 }}>
                  <Text variant="label" color="textSecondary">
                    Limit ve bakiye
                  </Text>
                  <View>
                    <FieldGroup>
                      <AmountField label="Kredi limiti (isteğe bağlı)" placeholder="0,00" value={creditLimit} onChangeText={setCreditLimit} />
                      <AmountField label="Güncel kart borcu (isteğe bağlı)" placeholder="0,00" value={openingBalance} onChangeText={setOpeningBalance} />
                    </FieldGroup>
                    {foot(
                      'Limit girilirse kart detayında kullanılabilir limit gösterilir. Güncel borç diğer hesapların toplam bakiyesine dahil edilmez, yalnızca bilgi amaçlıdır.'
                    )}
                  </View>
                </View>
              </>
            ) : isPos ? (
              <View>
                <FieldGroup>
                  <TextField label="Hesap adı" placeholder="Örn. Garanti POS" value={name} onChangeText={setName} />
                  <BankPicker selectedId={bankCode} onSelect={setBankCode} label="Banka" />
                  <TextField
                    label="Komisyon oranı (%)"
                    placeholder="Örn. 2,75"
                    keyboardType="decimal-pad"
                    value={commissionRate}
                    onChangeText={setCommissionRate}
                    error={commissionRateHasError ? '0 ile 100 arasında bir oran girin.' : undefined}
                  />
                  <AmountField label="Açılış bakiyesi (isteğe bağlı)" placeholder="0,00" value={openingBalance} onChangeText={setOpeningBalance} />
                </FieldGroup>
                {foot("Bu POS'a girilen her tahsilattan bu oranda komisyon otomatik düşülür; kasaya net tutar geçer.")}
              </View>
            ) : (
              <>
                <View>
                  <FieldGroup>
                    {type === 'bank' ? <BankPicker selectedId={bankCode} onSelect={setBankCode} label="Banka" /> : null}
                    <TextField
                      label="Hesap adı"
                      placeholder={isCash ? 'Örn. Nakit Kasa' : 'Örn. Garanti BBVA Ticari'}
                      value={name}
                      onChangeText={setName}
                    />
                    {isCash ? <ValueUnitPicker selectedId={valueUnitCode} onSelect={setValueUnitCode} label="Birim" /> : null}
                    {type === 'bank' ? (
                      <TextField
                        label="IBAN (isteğe bağlı)"
                        placeholder="TR00 0000 0000 0000 0000 0000 00"
                        value={iban}
                        onChangeText={(value) => setIban(formatIbanInput(value))}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={32}
                        style={{ fontFamily: monoFamily, fontSize: 16 }}
                        error={ibanHasError ? 'IBAN "TR" ile başlamalı ve 26 karakter olmalı.' : undefined}
                      />
                    ) : null}
                    {isBank ? (
                      <AmountField label="Ek hesap (KMH) limiti (isteğe bağlı)" placeholder="0,00" value={overdraftLimit} onChangeText={setOverdraftLimit} />
                    ) : null}
                    {isBank ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <AmountField label="Açılış bakiyesi" placeholder="₺0,00" value={openingBalance} onChangeText={setOpeningBalance} />
                        </View>
                        {/* Sayısal klavyede eksi tuşu yok; KMH kullanan hesabın başlangıç bakiyesi eksi olabildiği için
                            işaret klavyeden bağımsız bu düğmeyle değiştirilir. */}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={openingBalanceIsNegative ? 'Bakiyeyi pozitif yap' : 'Bakiyeyi negatif yap'}
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
                        label="Açılış bakiyesi (isteğe bağlı)"
                        placeholder={isCash && openingPrecision === 0 ? '1' : '0,00'}
                        precision={isCash ? openingPrecision : 2}
                        value={openingBalance}
                        onChangeText={setOpeningBalance}
                      />
                    )}
                  </FieldGroup>
                  {isBank
                    ? foot('IBAN yalnızca sizin göreceğiniz şekilde saklanır; listelerde son 4 hanesi görünür. Hesap zaten ek hesap (KMH) kullanımdaysa işareti eksiye çevirin.')
                    : isCash
                      ? foot('Bu kasada TL dışında döviz veya altın tutuyorsanız birimini seçin; bakiye ve hareketler bu birimde gösterilir.')
                      : null}
                </View>
              </>
            )}

            {saveMutation.error ? (
              <Text variant="caption" color="danger">
                {saveMutation.error instanceof Error ? saveMutation.error.message : 'Hesap kaydedilemedi'}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
