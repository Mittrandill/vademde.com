import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Button, Card, Divider, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { BankPicker } from '@/components/finance/BankPicker';
import { CreditCardVisual } from '@/components/finance/CreditCardVisual';
import { createAccount, getAccount, updateAccount, type Account } from '@/features/accounts/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { parseAmountToMinor } from '@/utils/money';
import { formatIbanInput, isValidIbanFormat, normalizeIban } from '@/utils/iban';
import { showSaveSuccess, showErrorAlert } from '@/utils/alerts';
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

function FormSection({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Card>
      <Stack gap="md">
        <Row gap="sm" align="center">
          <Ionicons name={icon} size={18} color={theme.colors.brandPrimary} />
          <Text variant="cardTitle">{title}</Text>
        </Row>
        <Divider />
        <Stack gap="md">{children}</Stack>
      </Stack>
    </Card>
  );
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
  const [creditLimit, setCreditLimit] = useState('');
  const [overdraftLimit, setOverdraftLimit] = useState('');
  const [initialized, setInitialized] = useState(false);
  const isCreditCard = type === 'credit_card';
  const isBank = type === 'bank';

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
    setCreditLimit(account.credit_limit_minor != null ? (account.credit_limit_minor / 100).toFixed(2).replace('.', ',') : '');
    setOverdraftLimit(
      account.overdraft_limit_minor != null ? (account.overdraft_limit_minor / 100).toFixed(2).replace('.', ',') : ''
    );
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
        opening_balance_minor: parseAmountToMinor(openingBalance) ?? 0,
        statement_day: isCreditCard && statementDay ? Number(statementDay) : null,
        payment_due_day: isCreditCard && paymentDueDay ? Number(paymentDueDay) : null,
        card_last_four: isCreditCard && cardLastFour ? cardLastFour : null,
        credit_limit_minor: isCreditCard ? parseAmountToMinor(creditLimit) : null,
        overdraft_limit_minor: isBank ? parseAmountToMinor(overdraftLimit) : null,
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

          <SegmentedControl
            options={TYPES.map((t) => ({ key: t.value, label: t.label }))}
            value={type}
            onChange={setType}
            stretch
          />

          {isCreditCard ? <CreditCardVisual account={previewAccount} /> : null}

          <TextField
            label={isCreditCard ? 'KART ADI' : 'HESAP ADI'}
            placeholder={isCreditCard ? 'Örn. Bonus Kartım' : 'Örn. Nakit Kasa'}
            value={name}
            onChangeText={setName}
          />

          {isCreditCard ? (
            <>
              <FormSection icon="card-outline" title="Kart Bilgileri">
                <Stack gap="sm">
                  <Text variant="caption" color="textSecondary">
                    BANKA (İSTEĞE BAĞLI)
                  </Text>
                  <BankPicker selectedId={bankCode} onSelect={setBankCode} />
                </Stack>

                <Stack gap="xs">
                  <TextField
                    label="KART SON 4 HANE (İSTEĞE BAĞLI)"
                    placeholder="0000"
                    keyboardType="number-pad"
                    maxLength={4}
                    value={cardLastFour}
                    onChangeText={(value) => setCardLastFour(value.replace(/[^0-9]/g, ''))}
                    error={cardLastFourHasError ? '4 haneli rakam girin.' : undefined}
                  />
                  <Text variant="caption" color="textSecondary">
                    Güvenlik nedeniyle yalnızca son 4 hane saklanır, tam kart numarası hiçbir zaman istenmez.
                  </Text>
                </Stack>
              </FormSection>

              <FormSection icon="calendar-outline" title="Kesim ve Ödeme">
                <Stack gap="xs">
                  <Row gap="sm">
                    <Stack style={{ flex: 1 }}>
                      <TextField
                        label="HESAP KESİM GÜNÜ"
                        placeholder="Örn. 15"
                        keyboardType="number-pad"
                        maxLength={2}
                        value={statementDay}
                        onChangeText={setStatementDay}
                        invalid={statementDayHasError}
                      />
                    </Stack>
                    <Stack style={{ flex: 1 }}>
                      <TextField
                        label="SON ÖDEME GÜNÜ"
                        placeholder="Örn. 5"
                        keyboardType="number-pad"
                        maxLength={2}
                        value={paymentDueDay}
                        onChangeText={setPaymentDueDay}
                        invalid={paymentDueDayHasError}
                      />
                    </Stack>
                  </Row>
                  <Text variant="caption" color={dayErrorMessage ? 'danger' : 'textSecondary'}>
                    {dayErrorMessage ??
                      'Son ödeme günü isteğe bağlıdır. Hesap kesiminden son ödeme gününe kadar ekstre yükleme hatırlatması gönderilir.'}
                  </Text>
                </Stack>
              </FormSection>

              <FormSection icon="wallet-outline" title="Limit ve Bakiye">
                <Stack gap="xs">
                  <TextField
                    label="KREDİ LİMİTİ (İSTEĞE BAĞLI)"
                    placeholder="0,00"
                    keyboardType="decimal-pad"
                    value={creditLimit}
                    onChangeText={setCreditLimit}
                  />
                  <Text variant="caption" color="textSecondary">
                    Girilirse kart detayında kullanılabilir limit ve limit kullanım oranı gösterilir.
                  </Text>
                </Stack>

                <Stack gap="xs">
                  <TextField
                    label="GÜNCEL KART BORCU (İSTEĞE BAĞLI)"
                    placeholder="0,00"
                    keyboardType="decimal-pad"
                    value={openingBalance}
                    onChangeText={setOpeningBalance}
                  />
                  <Text variant="caption" color="textSecondary">
                    Kartta şu an borcunuz varsa buraya girin (ör. 2.500,00). Bu tutar diğer hesapların toplam
                    bakiyesine dahil edilmez, yalnızca bilgi amaçlıdır.
                  </Text>
                </Stack>
              </FormSection>
            </>
          ) : (
            <>
              {type === 'bank' ? (
                <Stack gap="sm">
                  <Text variant="caption" color="textSecondary">
                    BANKA (İSTEĞE BAĞLI)
                  </Text>
                  <BankPicker selectedId={bankCode} onSelect={setBankCode} />
                </Stack>
              ) : null}

              {type === 'bank' ? (
                <TextField
                  label="IBAN (İSTEĞE BAĞLI)"
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                  value={iban}
                  onChangeText={(value) => setIban(formatIbanInput(value))}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={32}
                  error={ibanHasError ? 'IBAN "TR" ile başlamalı ve 26 karakter olmalı.' : undefined}
                />
              ) : null}

              {isBank ? (
                <Stack gap="sm">
                  <TextField
                    label="EK HESAP (KMH) LİMİTİ (İSTEĞE BAĞLI)"
                    placeholder="0,00"
                    keyboardType="decimal-pad"
                    value={overdraftLimit}
                    onChangeText={setOverdraftLimit}
                  />
                  <Text variant="caption" color="textSecondary">
                    Girilirse bakiyeniz bu tutara kadar sıfırın altına inebilir; hesap detayında ek hesap
                    kullanımınız gösterilir. Aylık ek hesap faizini bildiğinizde hesap detayından gider olarak
                    ekleyebilirsiniz.
                  </Text>
                </Stack>
              ) : null}

              {isBank ? (
                <Stack gap="sm">
                  <Text variant="caption" color="textSecondary">
                    AÇILIŞ BAKİYESİ (İSTEĞE BAĞLI)
                  </Text>
                  <Row gap="sm" align="center">
                    <Stack style={{ flex: 1 }}>
                      <TextField
                        placeholder="0,00"
                        keyboardType="decimal-pad"
                        value={openingBalance}
                        onChangeText={setOpeningBalance}
                      />
                    </Stack>
                    {/* Sayısal klavyede eksi tuşu yok (iOS/Android decimal-pad'de bulunmaz) —
                        KMH kullanan bir hesabın gerçek başlangıç bakiyesi eksi olabildiği için
                        işareti klavyeden bağımsız bu düğmeyle değiştiriyoruz. */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={openingBalanceIsNegative ? 'Bakiyeyi pozitif yap' : 'Bakiyeyi negatif yap'}
                      onPress={toggleOpeningBalanceSign}
                      style={{
                        width: theme.buttonHeight.primary,
                        height: theme.buttonHeight.primary,
                        borderRadius: theme.radius.input,
                        borderWidth: 1,
                        borderColor: openingBalanceIsNegative ? theme.colors.danger : theme.colors.border,
                        backgroundColor: openingBalanceIsNegative
                          ? withAlpha(theme.colors.danger, 0.12)
                          : theme.colors.surfacePrimary,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        variant="cardTitle"
                        style={{ color: openingBalanceIsNegative ? theme.colors.danger : theme.colors.textPrimary }}
                      >
                        {openingBalanceIsNegative ? '−' : '+'}
                      </Text>
                    </Pressable>
                  </Row>
                  <Text variant="caption" color="textSecondary">
                    Hesap zaten ek hesabı (KMH) kullanılmış durumda açılıyorsa, gerçek bakiyeyi yansıtmak için
                    işareti eksiye çevirin.
                  </Text>
                </Stack>
              ) : (
                <TextField
                  label="AÇILIŞ BAKİYESİ (İSTEĞE BAĞLI)"
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                  value={openingBalance}
                  onChangeText={setOpeningBalance}
                />
              )}
            </>
          )}

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
