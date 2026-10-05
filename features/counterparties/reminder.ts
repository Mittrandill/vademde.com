import { Linking } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { formatMinorAmount } from '@/utils/money';
import { getCounterpartyStatement, type Counterparty } from '@/features/counterparties/api';

// design Hatirlatma.html — alacak hatırlatma: ton şablonları + WhatsApp/SMS/e-posta + hesap özeti PDF.
// Mesaj kullanıcının kendi hesabından gider; Vademde kimseye kullanıcı adına yazmaz.
export type ReminderTone = 'nazik' | 'resmi' | 'kisa' | 'gecikti';
export type ReminderChannel = 'whatsapp' | 'sms' | 'email';

export const REMINDER_TONES: { key: ReminderTone; label: string }[] = [
  { key: 'nazik', label: 'Nazik' },
  { key: 'resmi', label: 'Resmi' },
  { key: 'kisa', label: 'Kısa' },
  { key: 'gecikti', label: 'Vadesi geçti' },
];

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

export interface ReminderContext {
  name: string;
  amountMinor: number;
  currencyCode?: string;
  dueDate: string | null;
  attachStatement: boolean;
}

export function buildReminderMessage(tone: ReminderTone, ctx: ReminderContext): string {
  const amount = formatMinorAmount(ctx.amountMinor, ctx.currencyCode ?? 'TRY');
  const due = ctx.dueDate ? `${dateFormatter.format(new Date(ctx.dueDate))} vadeli ` : '';
  const attachment = ctx.attachStatement ? ' Hesap özeti ektedir.' : '';
  const first = ctx.name.trim().split(/\s+/)[0] || ctx.name;

  switch (tone) {
    case 'resmi':
      return `Sayın ${ctx.name}, ${due}${amount} tutarındaki alacağımızla ilgili ödemenizi rica ederiz.${attachment} Saygılarımızla.`;
    case 'kisa':
      return `Merhaba ${first}, ${due}${amount} ödemenizi hatırlatırım.${attachment}`;
    case 'gecikti':
      return `Merhaba ${first}, ${due}${amount} tutarındaki ödemenizin vadesi geçti. En kısa sürede ödemenizi rica ederim.${attachment} İyi çalışmalar.`;
    default:
      return `Merhaba ${first}, ${due}${amount} tutarındaki ödemenizi hatırlatmak isterim.${attachment} İyi çalışmalar.`;
  }
}

function digitsOnly(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Türkiye: 0555… → 90555…; zaten ülke koduyla başlıyorsa dokunma.
  if (digits.startsWith('90')) return digits;
  if (digits.startsWith('0')) return `90${digits.slice(1)}`;
  return digits.length === 10 ? `90${digits}` : digits;
}

export class ReminderChannelError extends Error {}

export async function openReminderChannel(
  channel: ReminderChannel,
  counterparty: Pick<Counterparty, 'name' | 'phone' | 'email'>,
  message: string
): Promise<void> {
  const text = encodeURIComponent(message);

  if (channel === 'email') {
    if (!counterparty.email) throw new ReminderChannelError('Bu kişi için e-posta adresi kayıtlı değil.');
    const subject = encodeURIComponent('Ödeme hatırlatması');
    await Linking.openURL(`mailto:${counterparty.email}?subject=${subject}&body=${text}`);
    return;
  }

  if (!counterparty.phone) throw new ReminderChannelError('Bu kişi için telefon numarası kayıtlı değil.');

  if (channel === 'sms') {
    const separator = (await Linking.canOpenURL('sms:')) ? '&' : '?';
    await Linking.openURL(`sms:${counterparty.phone}${separator}body=${text}`);
    return;
  }

  const phone = digitsOnly(counterparty.phone);
  const appUrl = `whatsapp://send?phone=${phone}&text=${text}`;
  if (await Linking.canOpenURL(appUrl)) {
    await Linking.openURL(appUrl);
  } else {
    await Linking.openURL(`https://wa.me/${phone}?text=${text}`);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Hesap özeti: bakiye + son 3 hareket, tek sayfa PDF; sistem paylaşım sayfasıyla gönderilir.
export async function shareStatementPdf(
  workspaceId: string,
  counterparty: Pick<Counterparty, 'id' | 'name'>,
  netMinor: number
): Promise<void> {
  const entries = (await getCounterpartyStatement(workspaceId, counterparty.id)).slice(0, 3);
  const rows = entries
    .map(
      (e) =>
        `<tr><td>${escapeHtml(dateFormatter.format(new Date(e.date)))}</td><td>${escapeHtml(e.title)}</td><td class="r">${escapeHtml(
          formatMinorAmount(e.amountMinor, e.currencyCode)
        )}</td></tr>`
    )
    .join('');
  const html = `<html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111114;padding:40px}
    h1{font-size:22px;margin:0 0 4px} .m{color:#5E606A;font-size:13px}
    table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
    td{padding:10px 0;border-bottom:1px solid #DCDEE3} .r{text-align:right}
    .total{font-size:26px;font-weight:700;margin-top:16px}
  </style></head><body>
    <h1>Hesap özeti · ${escapeHtml(counterparty.name)}</h1>
    <div class="m">${escapeHtml(dateFormatter.format(new Date()))} itibarıyla</div>
    <div class="total">${escapeHtml(formatMinorAmount(Math.abs(netMinor)))}</div>
    <div class="m">${netMinor > 0 ? 'Cari bakiye (alacak)' : 'Cari bakiye'}</div>
    <table>${rows || '<tr><td class="m">Hareket yok.</td></tr>'}</table>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Hesap özeti' });
  }
}
