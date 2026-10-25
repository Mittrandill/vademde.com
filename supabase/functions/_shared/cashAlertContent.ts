import { formatTry, localeTag, type Locale } from './locale.ts';

export function cashAlertContent(locale: Locale, account: string | null, firstNegativeDate: string, lowest: number) {
  const when = new Intl.DateTimeFormat(localeTag(locale), { day: 'numeric', month: 'long' }).format(new Date(firstNegativeDate));
  const amount = formatTry(lowest, locale);
  if (locale === 'en') return { title: 'Cash alert', body: account
    ? `${account} may go negative on ${when} (lowest balance ${amount}).`
    : `Including unassigned payments, your total TRY balance may go negative on ${when} (lowest balance ${amount}).` };
  return { title: 'Nakit uyarısı', body: account
    ? `${account} ${when} tarihinde eksiye düşebilir (en düşük ${amount}).`
    : `Hesabı atanmamış ödemeler dahil, toplam TL bakiyen ${when} tarihinde eksiye düşebilir (en düşük ${amount}).` };
}
