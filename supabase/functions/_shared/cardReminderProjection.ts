import type { createClient } from 'jsr:@supabase/supabase-js@2';
import { projectCardLedger, type LedgerBalanceAccount, type LedgerCashAdvance, type LedgerPayment, type LedgerStatement, type LedgerTransaction } from './cardLedger.ts';
import type { ReminderRow } from './reminderContent.ts';

type AdminClient = Pick<ReturnType<typeof createClient>, 'from'>;
type Account = LedgerBalanceAccount & { is_archived: boolean };
type Statement = LedgerStatement & { account_id: string; installments?: { id: string }[] | null };
type Advance = LedgerCashAdvance & { account_id: string };

// Turkish bank calendar dates must not shift when the worker runs in UTC.
export function bankDay(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const { data, error } = await query(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []) as T[]);
    if (!data || data.length < 1000) return rows;
  }
  throw new Error('Card reminder read limit exceeded');
}

// Read-only financial normalization. The caller may cancel a stale reminder,
// but no obligation, transfer, payment or historical status is modified here.
export async function projectCardReminders(client: AdminClient, reminders: ReminderRow[], today = bankDay(new Date())) {
  const cancelled = new Set<string>();
  const projected = new Map<string, ReminderRow>();
  const workspaceIds = [...new Set(reminders.filter((r) => r.kind === 'card_payment_due' ||
    r.obligation?.document_type === 'kredi_karti_ekstresi').map((r) => r.workspace_id))];
  for (const workspaceId of workspaceIds) {
    const workspaceReminders = reminders.filter((r) => r.workspace_id === workspaceId);
    const accountIds = [...new Set(workspaceReminders.flatMap((r) => {
      const id = r.kind === 'card_payment_due' ? r.account_id : r.obligation?.document_type === 'kredi_karti_ekstresi' ? r.obligation.account_id : null;
      return id ? [id] : [];
    }))];
    if (!accountIds.length) continue;
    const [accounts, transactions, statements, advances] = await Promise.all([
      allRows<Account>((from, to) => client.from('accounts').select('id, statement_day, payment_due_day, opening_balance_minor, opening_balance_set_at, created_at, is_archived')
        .eq('workspace_id', workspaceId).eq('type', 'credit_card').in('id', accountIds).order('id').range(from, to)),
      allRows<LedgerTransaction>((from, to) => client.from('transactions').select('id, account_id, transfer_to_account_id, direction, amount_minor, occurred_at')
        .eq('workspace_id', workspaceId).order('id').range(from, to)),
      allRows<Statement>((from, to) => client.from('obligations').select('id, account_id, total_amount_minor, remaining_amount_minor, due_date, statement_date, status, created_at, installments(id), payments!payments_obligation_id_fkey(id, amount_minor, paid_at, transaction:transactions(id, account_id, transfer_to_account_id, direction, amount_minor, occurred_at))')
        .eq('workspace_id', workspaceId).eq('document_type', 'kredi_karti_ekstresi').in('account_id', accountIds).order('id').range(from, to)),
      allRows<Advance>((from, to) => client.from('obligations').select('account_id, remaining_amount_minor, created_at, status')
        .eq('workspace_id', workspaceId).eq('document_type', 'nakit_avans').in('account_id', accountIds).order('id').range(from, to)),
    ]);
    const datedTransaction = (tx: LedgerTransaction): LedgerTransaction => ({ ...tx, occurred_at: bankDay(tx.occurred_at) });
    const datedPayment = (payment: LedgerPayment): LedgerPayment => ({ ...payment,
      ...(payment.paid_at ? { paid_at: bankDay(payment.paid_at) } : {}),
      transaction: payment.transaction?.occurred_at ? { ...payment.transaction, occurred_at: bankDay(payment.transaction.occurred_at) } : payment.transaction });
    const byAccount = new Map(accounts.map((account) => [account.id, { account, ledger: projectCardLedger({ ...account,
      created_at: bankDay(account.created_at), opening_balance_set_at: account.opening_balance_set_at ? bankDay(account.opening_balance_set_at) : null },
    transactions.map(datedTransaction), statements.filter((row) => row.account_id === account.id).map((row) => ({ ...row,
      // Keep the original timestamp suffix to preserve ordering of same-day legacy duplicates.
      created_at: `${bankDay(row.created_at)}${row.created_at.slice(10)}`, payments: (row.payments ?? []).map(datedPayment) })),
    advances.filter((row) => row.account_id === account.id).map((row) => ({ ...row, created_at: bankDay(row.created_at) })), today) }]));
    for (const reminder of workspaceReminders) {
      const accountId = reminder.kind === 'card_payment_due' ? reminder.account_id
        : reminder.obligation?.document_type === 'kredi_karti_ekstresi' ? reminder.obligation.account_id : null;
      if (!accountId) continue;
      // Preserve historical installment reminder amounts and schedules.
      if (statements.some((row) => row.account_id === accountId && row.installments?.length)) continue;
      const context = byAccount.get(accountId);
      if (!context || context.account.is_archived || context.ledger.debtMinor <= 0) {
        cancelled.add(reminder.id);
        continue;
      }
      if (reminder.obligation?.document_type === 'kredi_karti_ekstresi') {
        const row = context.ledger.statementProjections.find((p) => p.statementId === reminder.obligation_id);
        if (!row || row.isFuture || row.carriedIntoStatementId || row.remainingMinor <= 0) cancelled.add(reminder.id);
        else projected.set(reminder.id, { ...reminder, obligation: { ...reminder.obligation, remaining_amount_minor: row.remainingMinor } });
      } else if (reminder.kind === 'card_payment_due' && reminder.period_key && context.ledger.statementProjections
        .some((p) => !p.isFuture && p.cutoffDate.slice(0, 7) === reminder.period_key)) cancelled.add(reminder.id);
    }
  }
  return { cancelled, reminders: reminders.map((r) => projected.get(r.id) ?? r) };
}
