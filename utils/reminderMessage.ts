import { t } from '@/i18n';
import { BANKS } from '@/features/banks/banks';
import { SERVICES } from '@/features/services/services';
import { VALUE_UNIT_BY_CODE } from '@/features/valueUnits/units';
import { localeNumberFormatter } from '@/i18n/format';

// Push bildirimiyle aynı cümle: "Türkiye İş Bankası 10.000 TL Tutarındaki Kredi Ödemeniz 3 Gün Sonra".
// supabase/functions/send-reminders/index.ts aynı eşlemeleri taşır (Deno uygulama kodunu içe aktaramaz);
// birini değiştirirsen diğerini de güncelle.

const STAGE_WHEN: Record<string, string> = {
  get '7_days_before'() { return t('reminderMessages.stages.7_days_before'); },
  get '3_days_before'() { return t('reminderMessages.stages.3_days_before'); },
  get due_day() { return t('reminderMessages.stages.due_day'); },
  get overdue_1_day() { return t('reminderMessages.stages.overdue_1_day'); },
};

const PAYABLE_NOUN: Record<string, string> = {
  get kredi() { return t('reminderMessages.payable.kredi'); },
  get kredi_karti_ekstresi() { return t('reminderMessages.payable.kredi_karti_ekstresi'); },
  get nakit_avans() { return t('reminderMessages.payable.nakit_avans'); },
  get cek() { return t('reminderMessages.payable.cek'); },
  get senet() { return t('reminderMessages.payable.senet'); },
  get fatura() { return t('reminderMessages.payable.fatura'); },
  get abonelik() { return t('reminderMessages.payable.abonelik'); },
  get kira() { return t('reminderMessages.payable.kira'); },
  get maas() { return t('reminderMessages.payable.maas'); },
  get vergi_sgk() { return t('reminderMessages.payable.vergi_sgk'); },
  get tedarikci_borcu() { return t('reminderMessages.payable.tedarikci_borcu'); },
  get sozlesme_odeme_plani() { return t('reminderMessages.payable.sozlesme_odeme_plani'); },
};

const RECEIVABLE_NOUN: Record<string, string> = {
  get cek() { return t('reminderMessages.receivable.cek'); },
  get senet() { return t('reminderMessages.receivable.senet'); },
  get borc_verme() { return t('reminderMessages.receivable.borc_verme'); },
  get musteri_alacagi() { return t('reminderMessages.receivable.musteri_alacagi'); },
  get kira() { return t('reminderMessages.receivable.kira'); },
};

const SERVICE_NAME = new Map(SERVICES.map((s) => [s.code, s.name]));

// "10.000 TL", "10.000,50 TL", "2 Çeyrek Altın". Kuruşsuz tutarda ondalık yazılmaz.
export function formatReminderAmount(amountMinor: number, currencyCode: string): string {
  const unit = VALUE_UNIT_BY_CODE[currencyCode];
  const value = unit && unit.precision === 0 ? amountMinor : amountMinor / 100;
  const hasFraction = Math.abs(value - Math.round(value)) > 1e-9;
  const text = localeNumberFormatter({
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
  const label = currencyCode === 'TRY' ? 'TL' : unit && unit.unitType === 'kiymetli_maden' ? unit.name : currencyCode;
  return `${text} ${label}`;
}

export interface ReminderMessageObligation {
  title: string;
  direction: string;
  document_type: string | null;
  bank_code: string | null;
  service_code: string | null;
  counterparty?: { name: string } | null;
  currency_code: string;
}

export function buildObligationReminderMessage(
  obligation: ReminderMessageObligation,
  amountMinor: number,
  stage: string
): { title: string; body: string } {
  const type = obligation.document_type ?? '';
  const noun =
    obligation.direction === 'payable'
      ? (PAYABLE_NOUN[type] ?? t('reminderMessages.payment'))
      : (RECEIVABLE_NOUN[type] ?? t('reminderMessages.collection'));
  const subject =
    (obligation.bank_code && BANKS.find((bank) => bank.code === obligation.bank_code)?.name) ||
    (obligation.service_code && SERVICE_NAME.get(obligation.service_code)) ||
    obligation.counterparty?.name ||
    obligation.title;
  const when = STAGE_WHEN[stage] ?? '';
  return {
    title: obligation.direction === 'payable' ? t('reminderMessages.paymentTitle') : t('reminderMessages.collectionTitle'),
    body: t('reminderMessages.body', { subject, amount: formatReminderAmount(amountMinor, obligation.currency_code), noun, when }).trim(),
  };
}
