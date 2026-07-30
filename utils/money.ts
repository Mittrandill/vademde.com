// docs/01-finansal-kayit-modeli.md §8.1 — tutarlar en küçük para birimiyle (kuruş) tam sayı
// olarak tutulur; para birimi ISO koduyla saklanır. Görüntüleme Türkçe yerelleştirilir.

export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinorUnits(amountMinor: number): number {
  return amountMinor / 100;
}

export function formatMinorAmount(
  amountMinor: number,
  currencyCode: string = 'TRY',
  locale: string = 'tr-TR'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fromMinorUnits(amountMinor));
}
