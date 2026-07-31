export interface InstallmentPlanItem {
  installmentNumber: number;
  dueDate: string;
  amountMinor: number;
  principalMinor: number;
  interestMinor: number;
}

// docs/01-finansal-kayit-modeli.md §8.1 — taksit toplamı ana toplamla uyuşmuyorsa
// son taksit düzeltmesi yapılır; kalan kuruş son taksite eklenir. totalInterestMinor
// verilirse (yalnızca kredi eklerken, isteğe bağlı) anapara ve faiz ayrı ayrı eşit
// bölünüp taksit tutarına toplanır; anapara/faiz ayrımı yalnızca detay ekranında
// gösterilir, taksit tutarının kendisini etkilemez.
export function buildEqualInstallments(
  totalPrincipalMinor: number,
  count: number,
  firstDueDate: string,
  totalInterestMinor = 0
): InstallmentPlanItem[] {
  const basePrincipal = Math.floor(totalPrincipalMinor / count);
  const principalRemainder = totalPrincipalMinor - basePrincipal * count;
  const baseInterest = Math.floor(totalInterestMinor / count);
  const interestRemainder = totalInterestMinor - baseInterest * count;
  const firstDate = new Date(firstDueDate);

  return Array.from({ length: count }, (_, index) => {
    const due = new Date(firstDate);
    due.setMonth(due.getMonth() + index);
    const isLast = index === count - 1;
    const principalMinor = isLast ? basePrincipal + principalRemainder : basePrincipal;
    const interestMinor = isLast ? baseInterest + interestRemainder : baseInterest;
    return {
      installmentNumber: index + 1,
      dueDate: due.toISOString().slice(0, 10),
      amountMinor: principalMinor + interestMinor,
      principalMinor,
      interestMinor,
    };
  });
}
