import { BANK_NAMES, SERVICE_NAMES } from '../send-reminders/names.ts';
import { trreminderMessages, enreminderMessages, trnotifications, ennotifications } from './reminderMessages.ts';
import { localeTag, type Locale } from './locale.ts';

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/{{(\w+)}}/g, (_, key: string) => values[key] ?? '');
}

export interface ReminderRow {
  id: string;
  workspace_id: string;
  obligation_id: string | null;
  account_id: string | null;
  kind: 'obligation_due' | 'statement_upload' | 'card_payment_due';
  stage: string;
  remind_at: string;
  obligation: {
    id: string;
    title: string;
    direction: 'payable' | 'receivable';
    status: string;
    remaining_amount_minor: number;
    currency_code: string;
    document_type: string | null;
    bank_code: string | null;
    service_code: string | null;
    counterparty: { name: string } | null;
  } | null;
  account: { id: string; name: string } | null;
}

const UNIT_LABEL: Record<string, string> = {
  TRY: 'TL', gram_altin: 'Gram Altın', ceyrek_altin: 'Çeyrek Altın', yarim_altin: 'Yarım Altın',
  tam_altin: 'Tam Altın', cumhuriyet_altini: 'Cumhuriyet Altını',
};
const UNIT_LABEL_EN: Record<string, string> = {
  TRY: 'TL', gram_altin: 'Gram Gold', ceyrek_altin: 'Quarter Gold Coin', yarim_altin: 'Half Gold Coin',
  tam_altin: 'Full Gold Coin', cumhuriyet_altini: 'Republic Gold Coin',
};

function formatAmount(amountMinor: number, currencyCode: string, locale: Locale): string {
  const isCoin = ['ceyrek_altin', 'yarim_altin', 'tam_altin', 'cumhuriyet_altini'].includes(currencyCode);
  const value = isCoin ? amountMinor : (Number.isFinite(amountMinor) ? amountMinor : 0) / 100;
  const hasFraction = Math.abs(value - Math.round(value)) > 1e-9;
  const text = new Intl.NumberFormat(localeTag(locale), { minimumFractionDigits: hasFraction ? 2 : 0, maximumFractionDigits: 2 }).format(value);
  return `${text} ${(locale === 'en' ? UNIT_LABEL_EN : UNIT_LABEL)[currencyCode] ?? currencyCode}`;
}

function subjectFor(o: NonNullable<ReminderRow['obligation']>): string {
  if (o.bank_code && BANK_NAMES[o.bank_code]) return BANK_NAMES[o.bank_code];
  if (o.service_code && SERVICE_NAMES[o.service_code]) return SERVICE_NAMES[o.service_code];
  return o.counterparty?.name || o.title;
}

export function contentFor(reminder: ReminderRow, nextInstallmentAmountMinor: number | undefined, locale: Locale = 'tr') {
  const notifications = locale === 'en' ? ennotifications : trnotifications;
  if (reminder.kind === 'statement_upload' && reminder.account) {
    return { title: notifications.statementTitle, body: interpolate(notifications.statementBody, { account: reminder.account.name }),
      data: { accountId: reminder.account.id, stage: reminder.stage } };
  }
  if (reminder.kind === 'card_payment_due' && reminder.account) {
    const when = reminder.stage === 'due_day' ? notifications.cardDueToday : notifications.cardDueIn3;
    return { title: notifications.cardDueTitle, body: interpolate(notifications.cardDueBody, { account: reminder.account.name, when }),
      data: { accountId: reminder.account.id, stage: reminder.stage } };
  }
  if (!reminder.obligation) return null;
  const o = reminder.obligation;
  const messages = locale === 'en' ? enreminderMessages : trreminderMessages;
  const noun = o.direction === 'payable'
    ? ((messages.payable as Record<string, string>)[o.document_type ?? ''] ?? messages.payment)
    : ((messages.receivable as Record<string, string>)[o.document_type ?? ''] ?? messages.collection);
  const when = (messages.stages as Record<string, string>)[reminder.stage] ?? '';
  return { title: o.direction === 'payable' ? messages.paymentTitle : messages.collectionTitle,
    body: interpolate(messages.body, { subject: subjectFor(o), amount: formatAmount(nextInstallmentAmountMinor ?? o.remaining_amount_minor, o.currency_code, locale), noun, when }).trim(),
    data: { obligationId: o.id, stage: reminder.stage } };
}
