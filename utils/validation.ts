// docs/01-finansal-kayit-modeli.md §8.1 — taksit toplamı ana toplamla uyuşmuyorsa
// son taksit düzeltmesi veya kullanıcı onayı gerekir.
export function installmentTotalMatches(
  totalAmountMinor: number,
  installmentAmountsMinor: number[]
): boolean {
  const sum = installmentAmountsMinor.reduce((acc, amount) => acc + amount, 0);
  return sum === totalAmountMinor;
}
