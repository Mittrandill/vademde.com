import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { BigAmountInput, Button, FieldGroup, MonthStepper, Stack, Text, TextField } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { AccountPicker } from '@/components/finance/AccountPicker';
import { getAccount, listAccounts, type Account } from '@/features/accounts/api';
import { cardStatementTitle, saveCardStatement } from '@/features/accounts/statements';
import { getObligationWithInstallments, type Obligation } from '@/features/obligations/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { invalidatePaymentRelatedQueries, queryKeys } from '@/services/queryKeys';
import { syncCreditCardStatementReminder } from '@/services/creditCardReminders';
import { syncObligationReminder } from '@/services/notifications';
import { computeStatementPeriod, periodKeyFor, periodKeyForStatement } from '@/utils/creditCardPeriod';
import { isStatementPeriod, latestClosedStatementPeriod, validateStatementDates } from '@/utils/cardStatementForm';
import { statementCutoff, localDay } from '@/utils/cardDebt';
import { formatAmountInput, parseAmountToMinor } from '@/utils/money';
import { useExitGuard } from '@/utils/useExitGuard';
import { friendlyErrorMessage, showErrorAlert, showSaveSuccess } from '@/utils/alerts';
import { getInputDecimalSeparator } from '@/i18n/format';
import { t } from '@/i18n';

export default function CardStatementScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ accountId?: string; period?: string; id?: string }>();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const accountsQuery = useQuery({
    queryKey: workspaceId ? queryKeys.accounts(workspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(workspaceId as string), enabled: !!workspaceId,
  });
  const existingQuery = useQuery({
    queryKey: ['obligation', params.id, 'edit'],
    queryFn: () => getObligationWithInstallments(params.id as string, { raw: true }), enabled: !!params.id,
  });
  const accountId = params.accountId ?? existingQuery.data?.obligation.account_id ?? selectedId;
  const accountQuery = useQuery({
    queryKey: ['account', accountId], queryFn: () => getAccount(accountId as string),
    enabled: !!workspaceId && !!accountId,
  });
  const cards = (accountsQuery.data ?? []).filter((a) => a.type === 'credit_card');
  const account = accountQuery.data;
  const initial = existingQuery.data?.obligation;
  const loading = !accountsQuery.isSuccess || (!!accountId && !accountQuery.isSuccess) || (!!params.id && !existingQuery.isSuccess);
  const error = accountsQuery.error ?? accountQuery.error ?? existingQuery.error;
  const invalid = (!!account && (account.workspace_id !== workspaceId || account.type !== 'credit_card' || (!initial && account.is_archived))) ||
    (!!initial && (initial.workspace_id !== workspaceId || initial.account_id !== accountId ||
    initial.document_type !== 'kredi_karti_ekstresi' || initial.status === 'iptal_edildi'));

  if (workspaceId && account && !loading && !invalid) {
    return <StatementForm key={`${workspaceId}:${account.id}:${params.id ?? 'new'}`} workspaceId={workspaceId} account={account}
      initial={initial ?? null} requestedPeriod={params.period} hasLegacyPlan={!!existingQuery.data?.installments.length} />;
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard, gap: theme.spacing.md }}>
        <ScreenHeader inline title={t('accounts.statement.newTitle')}
          leftLabel={{ label: t('common.cancel'), onPress: () => router.canGoBack() ? router.back() : router.replace('/accounts/credit-cards') }} />
        {error ? <Text color="danger">{friendlyErrorMessage(error, t('accounts.detail.loadFailed'))}</Text>
          : loading ? null : accountId || invalid ? <Text color="danger">{t('accounts.statement.invalidCard')}</Text>
          : cards.length ? (
            <FieldGroup><AccountPicker label={t('accounts.detail.creditCard')} accounts={cards} selectedId={selectedId} onSelect={setSelectedId} /></FieldGroup>
          ) : <Button label={t('accounts.cards.newCard')} onPress={() => router.replace({ pathname: '/accounts/new', params: { type: 'credit_card' } })} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatementForm({ workspaceId, account, initial, requestedPeriod, hasLegacyPlan }: {
  workspaceId: string; account: Account; initial: Obligation | null; requestedPeriod?: string; hasLegacyPlan: boolean;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const initialPeriod = initial ? periodKeyForStatement(account, initial) : null;
  const [period, setPeriod] = useState(initialPeriod ?? (requestedPeriod && isStatementPeriod(requestedPeriod) ? requestedPeriod : latestClosedStatementPeriod(account)));
  const schedule = computeStatementPeriod(account, new Date(`${period}-01T12:00:00`));
  const useStoredDates = !!initial && period === initialPeriod;
  const cutoff = useStoredDates ? initial.statement_date ?? (initial.due_date
    ? statementCutoff(account, initial.due_date, initial.created_at).date
    : '') : schedule ? localDay(schedule.statementDate) : '';
  const due = useStoredDates ? initial.due_date ?? '' : schedule ? localDay(schedule.dueDate) : '';
  const [amount, setAmount] = useState(initial ? formatAmountInput((initial.total_amount_minor / 100).toFixed(2).replace('.', getInputDecimalSeparator())) : '');
  const [titleDraft, setTitleDraft] = useState<string | null>(initial?.title ?? null);
  const [dirty, setDirty] = useState(false);
  const { allowExit } = useExitGuard(dirty);
  const dateError = validateStatementDates(period, cutoff, due);
  const totalMinor = parseAmountToMinor(amount);
  const title = titleDraft ?? cardStatementTitle(account.name, period);
  const canSave = !hasLegacyPlan && !dateError && totalMinor != null && totalMinor > 0 && !!title.trim();
  const close = () => router.canGoBack() ? router.back() : router.replace(`/accounts/${account.id}`);
  const mutation = useMutation({
    mutationFn: () => saveCardStatement({ workspaceId, accountId: account.id, period, statementDate: cutoff, dueDate: due, totalMinor: totalMinor as number, title, id: initial?.id }),
    onSuccess: (statement) => {
      allowExit();
      showSaveSuccess(t('accounts.statement.saved'), close, () => {
        invalidatePaymentRelatedQueries(queryClient, workspaceId);
        queryClient.invalidateQueries({ queryKey: ['obligation', statement.id] });
        syncObligationReminder(workspaceId, statement).catch(() => {});
        syncCreditCardStatementReminder(workspaceId, account).catch(() => {});
      });
    },
    onError: (error) => showErrorAlert(error),
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: theme.screenEdge.standard, paddingBottom: theme.spacing.xxl }}>
          <ScreenHeader inline title={t(initial ? 'accounts.statement.editTitle' : 'accounts.statement.newTitle')}
            leftLabel={{ label: t('common.cancel'), onPress: close }}
            rightLabel={{ label: t(initial ? 'accounts.form.update' : 'common.save'), bold: true, disabled: !canSave || mutation.isPending, onPress: () => { if (canSave && !mutation.isPending) mutation.mutate(); } }} />
          <Stack gap="md" style={{ marginTop: theme.spacing.xs }}>
            <MonthStepper year={Number(period.slice(0, 4))} month={Number(period.slice(5, 7)) - 1} onChange={({ year, month }) => {
              const next = new Date(year, month, 1);
              setPeriod(periodKeyFor(next));
              setDirty(true);
            }} />
            <View style={{ marginTop: theme.spacing.md, marginBottom: theme.spacing.xs }}>
              <BigAmountInput value={amount} onChangeText={(value) => { setAmount(value); setDirty(true); }}
                symbol={account.currency_code === 'TRY' ? '₺' : account.currency_code === 'USD' ? '$' : account.currency_code === 'EUR' ? '€' : undefined} autoFocus={!initial} />
            </View>
            <FieldGroup>
              <TextField label={t('accounts.statement.titleLabel')} value={title} onChangeText={(value) => { setTitleDraft(value); setDirty(true); }} />
            </FieldGroup>
            {dateError ? <Text variant="caption" color={dateError === 'notClosed' ? 'textSecondary' : 'danger'} style={{ paddingHorizontal: 16 }}>
              {t(`accounts.statement.${dateError}`)}
            </Text> : null}
            {dateError === 'invalidDates' ? <Button label={t('accounts.statement.editCardDates')} variant="secondary"
              onPress={() => router.push({ pathname: '/accounts/new', params: { id: account.id } })} /> : null}
            <Text variant="caption" color="textSecondary" style={{ paddingHorizontal: 16 }}>{t('accounts.statement.amountHint')}</Text>
            {hasLegacyPlan ? <Text variant="caption" color="danger">{t('accounts.statement.legacyPlan')}</Text> : null}
            {mutation.error ? <Text variant="caption" color="danger">{friendlyErrorMessage(mutation.error, t('accounts.form.saveFailed'))}</Text> : null}
          </Stack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
