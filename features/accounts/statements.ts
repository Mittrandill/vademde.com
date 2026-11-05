import { supabase } from '@/services/supabase';
import { fetchAll } from '@/services/fetchAll';
import { t } from '@/i18n';
import { capitalizeUi, localeDateFormatter } from '@/i18n/format';
import { getAccount } from '@/features/accounts/api';
import { createObligation, getObligationWithInstallments, type Obligation } from '@/features/obligations/api';
import { periodKeyForStatement } from '@/utils/creditCardPeriod';
import { validateStatementDates } from '@/utils/cardStatementForm';

export function cardStatementTitle(cardName: string, period: string): string {
  const month = capitalizeUi(localeDateFormatter({ month: 'long', year: 'numeric' }).format(new Date(`${period}-01T12:00:00`)));
  return t('accounts.statement.autoTitle', { card: cardName, period: month });
}

export interface SaveCardStatementInput {
  workspaceId: string;
  accountId: string;
  period: string;
  statementDate: string;
  dueDate: string;
  totalMinor: number;
  title?: string;
  id?: string;
}

/** Only writes the statement. No purchases, transfers, opening balance, or installment plan are created. */
export async function saveCardStatement(input: SaveCardStatementInput): Promise<Obligation> {
  const dateError = validateStatementDates(input.period, input.statementDate, input.dueDate);
  if (dateError) throw new Error(t(`accounts.statement.${dateError}`));
  if (!Number.isSafeInteger(input.totalMinor) || input.totalMinor <= 0) throw new Error(t('accounts.statement.invalidAmount'));
  if (input.title !== undefined && !input.title.trim()) throw new Error(t('accounts.statement.titleRequired'));

  const account = await getAccount(input.accountId);
  if (account.workspace_id !== input.workspaceId || account.type !== 'credit_card' || (account.is_archived && !input.id)) {
    throw new Error(t('accounts.statement.invalidCard'));
  }
  const existing = input.id ? await getObligationWithInstallments(input.id, { raw: true }) : null;
  if (existing && (existing.obligation.workspace_id !== input.workspaceId ||
      existing.obligation.account_id !== input.accountId ||
      existing.obligation.document_type !== 'kredi_karti_ekstresi' ||
      existing.obligation.status === 'iptal_edildi')) {
    throw new Error(t('accounts.statement.invalidCard'));
  }
  if (existing?.installments.length) throw new Error(t('accounts.statement.legacyPlan'));
  const paidMinor = existing ? existing.obligation.total_amount_minor - existing.obligation.remaining_amount_minor : 0;
  if (input.totalMinor < paidMinor) throw new Error(t('accounts.statement.belowPaid'));

  // Include legacy rows with inferred periods, not just explicitly dated new rows.
  const statements = await fetchAll<Pick<Obligation, 'id' | 'due_date' | 'statement_date'>>((from, to) => supabase
    .from('obligations').select('id, due_date, statement_date')
    .eq('workspace_id', input.workspaceId).eq('account_id', input.accountId)
    .eq('document_type', 'kredi_karti_ekstresi').neq('status', 'iptal_edildi')
    .order('id').range(from, to));
  if (statements.some((row) => row.id !== input.id && periodKeyForStatement(account, row) === input.period)) {
    throw new Error(t('accounts.statement.duplicate'));
  }
  const fields = {
    title: input.title?.trim() ?? cardStatementTitle(account.name, input.period),
    total_amount_minor: input.totalMinor,
    statement_date: input.statementDate,
    due_date: input.dueDate,
  };
  try {
    // Updating leaves legacy categories, bank links, payments and all other fields intact.
    if (existing) {
      // If another device pays/edits the statement after our read, require a fresh read.
      // PostgreSQL rechecks these predicates after waiting for a concurrent row lock.
      const { data, error } = await supabase.from('obligations').update(fields)
        .eq('id', existing.obligation.id).eq('workspace_id', input.workspaceId)
        .eq('account_id', input.accountId).eq('document_type', 'kredi_karti_ekstresi')
        .eq('total_amount_minor', existing.obligation.total_amount_minor)
        .eq('remaining_amount_minor', existing.obligation.remaining_amount_minor)
        .eq('status', existing.obligation.status)
        .select('*').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(t('accounts.statement.changed'));
      return data;
    }
    return await createObligation({
      ...fields,
      workspace_id: input.workspaceId,
      account_id: account.id,
      bank_code: account.bank_code,
      direction: 'payable',
      document_type: 'kredi_karti_ekstresi',
      currency_code: account.currency_code,
      category_id: null,
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new Error(t('accounts.statement.duplicate'));
    throw error;
  }
}
