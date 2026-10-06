import { BANKS } from '@/features/banks/banks';
import { SERVICES } from '@/features/services/services';
import { VALUE_UNIT_BY_CODE } from '@/features/valueUnits/units';

// Push bildirimiyle aynı cümle: "Türkiye İş Bankası 10.000 TL Tutarındaki Kredi Ödemeniz 3 Gün Sonra".
// supabase/functions/send-reminders/index.ts aynı eşlemeleri taşır (Deno uygulama kodunu içe aktaramaz);
// birini değiştirirsen diğerini de güncelle.

const STAGE_WHEN: Record<string, string> = {
  '7_days_before': '7 Gün Sonra',
  '3_days_before': '3 Gün Sonra',
  due_day: 'Bugün',
  overdue_1_day: '1 Gün Gecikti',
};

const PAYABLE_NOUN: Record<string, string> = {
  kredi: 'Kredi Ödemeniz',
  kredi_karti_ekstresi: 'Kredi Kartı Ödemeniz',
  nakit_avans: 'Nakit Avans Ödemeniz',
  cek: 'Çek Ödemeniz',
  senet: 'Senet Ödemeniz',
  fatura: 'Fatura Ödemeniz',
  abonelik: 'Abonelik Ödemeniz',
  kira: 'Kira Ödemeniz',
  maas: 'Maaş Ödemeniz',
  vergi_sgk: 'Vergi / SGK Ödemeniz',
  tedarikci_borcu: 'Tedarikçi Ödemeniz',
  sozlesme_odeme_plani: 'Sözleşme Ödemeniz',
};

const RECEIVABLE_NOUN: Record<string, string> = {
  cek: 'Çek Tahsilatınız',
  senet: 'Senet Tahsilatınız',
  borc_verme: 'Borç Tahsilatınız',
  musteri_alacagi: 'Müşteri Tahsilatınız',
  kira: 'Kira Tahsilatınız',
};

const BANK_NAME = new Map(BANKS.map((b) => [b.code, b.name]));
const SERVICE_NAME = new Map(SERVICES.map((s) => [s.code, s.name]));

// "10.000 TL", "10.000,50 TL", "2 Çeyrek Altın". Kuruşsuz tutarda ondalık yazılmaz.
export function formatReminderAmount(amountMinor: number, currencyCode: string): string {
  const unit = VALUE_UNIT_BY_CODE[currencyCode];
  const value = unit && unit.precision === 0 ? amountMinor : amountMinor / 100;
  const hasFraction = Math.abs(value - Math.round(value)) > 1e-9;
  const text = new Intl.NumberFormat('tr-TR', {
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
      ? (PAYABLE_NOUN[type] ?? 'Ödemeniz')
      : (RECEIVABLE_NOUN[type] ?? 'Tahsilatınız');
  const subject =
    (obligation.bank_code && BANK_NAME.get(obligation.bank_code)) ||
    (obligation.service_code && SERVICE_NAME.get(obligation.service_code)) ||
    obligation.counterparty?.name ||
    obligation.title;
  const when = STAGE_WHEN[stage] ?? '';
  return {
    title: obligation.direction === 'payable' ? 'Ödeme Hatırlatması' : 'Tahsilat Hatırlatması',
    body: `${subject} ${formatReminderAmount(amountMinor, obligation.currency_code)} Tutarındaki ${noun} ${when}`.trim(),
  };
}
