export interface InstallmentPlanItem {
  installmentNumber: number;
  dueDate: string;
  amountMinor: number;
}

// docs/01-finansal-kayit-modeli.md §8.1 — taksit toplamı ana toplamla uyuşmuyorsa
// son taksit düzeltmesi yapılır; kalan kuruş son taksite eklenir.
export function buildEqualInstallments(
  totalAmountMinor: number,
  count: number,
  firstDueDate: string
): InstallmentPlanItem[] {
  const base = Math.floor(totalAmountMinor / count);
  const remainder = totalAmountMinor - base * count;
  const firstDate = new Date(firstDueDate);

  return Array.from({ length: count }, (_, index) => {
    const due = new Date(firstDate);
    due.setMonth(due.getMonth() + index);
    return {
      installmentNumber: index + 1,
      dueDate: due.toISOString().slice(0, 10),
      amountMinor: index === count - 1 ? base + remainder : base,
    };
  });
}
