// docs/08-tasarim-sistemi.md §12.19 — "IBAN ve kart numarası maskeleme" bağlayıcı
// erişilebilirlik/gizlilik kuralı; IBAN her zaman kısmen maskelenmiş gösterilir.

export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function formatIbanInput(value: string): string {
  const normalized = normalizeIban(value).slice(0, 26);
  return (normalized.match(/.{1,4}/g) ?? []).join(' ');
}

export function isValidIbanFormat(value: string): boolean {
  return /^TR\d{24}$/.test(normalizeIban(value));
}

export function maskIban(value: string): string {
  const normalized = normalizeIban(value);
  if (normalized.length <= 10) return normalized;

  const visibleStart = normalized.slice(0, 6);
  const visibleEnd = normalized.slice(-4);
  const maskedMiddle = '*'.repeat(normalized.length - visibleStart.length - visibleEnd.length);

  return (`${visibleStart}${maskedMiddle}${visibleEnd}`.match(/.{1,4}/g) ?? []).join(' ');
}
