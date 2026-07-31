export interface InstallmentPlanItem {
  installmentNumber: number;
  dueDate: string;
  amountMinor: number;
  principalMinor: number;
  interestMinor: number;
}

// docs/01-finansal-kayit-modeli.md §8.1 — taksit toplamı ana toplamla uyuşmuyorsa
// son taksit düzeltmesi yapılır; kalan kuruş/faiz son taksite eklenir.
// monthlyInterestRatePercent verilirse (yalnızca kredi eklerken, isteğe bağlı) azalan
// bakiye üzerinden gerçek bir amortisman planı hesaplanır: sabit taksit tutarı anüite
// formülüyle bulunur, her taksitte faiz = kalan bakiye × aylık oran, anapara = sabit
// taksit - o ayki faiz; oran 0 ise düz eşit bölüşüme döner. Anapara/faiz ayrımı
// yalnızca detay ekranında gösterilir.
export function buildAmortizedInstallments(
  principalMinor: number,
  count: number,
  firstDueDate: string,
  monthlyInterestRatePercent = 0
): InstallmentPlanItem[] {
  const rate = monthlyInterestRatePercent / 100;
  const firstDate = new Date(firstDueDate);

  const fixedPaymentMinor =
    rate === 0
      ? Math.round(principalMinor / count)
      : Math.round((principalMinor * rate * (1 + rate) ** count) / ((1 + rate) ** count - 1));

  let remainingMinor = principalMinor;

  return Array.from({ length: count }, (_, index) => {
    const due = new Date(firstDate);
    due.setMonth(due.getMonth() + index);
    const isLast = index === count - 1;

    const interestMinor = Math.round(remainingMinor * rate);
    const principalMinorForInstallment = isLast
      ? remainingMinor
      : Math.min(Math.max(fixedPaymentMinor - interestMinor, 0), remainingMinor);
    remainingMinor = isLast ? 0 : remainingMinor - principalMinorForInstallment;

    return {
      installmentNumber: index + 1,
      dueDate: due.toISOString().slice(0, 10),
      amountMinor: principalMinorForInstallment + interestMinor,
      principalMinor: principalMinorForInstallment,
      interestMinor,
    };
  });
}
