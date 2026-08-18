export interface InstallmentPlanItem {
  installmentNumber: number;
  dueDate: string;
  amountMinor: number;
  principalMinor: number;
  interestMinor: number;
}

// Taksit planı düzenlemesinde "başlangıç tarihi" değiştiğinde tüm ödenmemiş taksitleri
// aynı aylık kadansla yeniden dizmek için (bkz. app/obligations/new.tsx InstallmentPlanEditor).
export function addMonthsToIsoDate(isoDate: string, months: number): string {
  const date = new Date(isoDate);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

export interface InstallmentEditRecompute {
  amountMinor: number;
  remainingAmountMinor: number;
  status: string;
}

// installments.remaining_amount_minor/status yalnızca ödeme (payments) değişince DB
// trigger'ıyla (recompute_installment_progress) yeniden hesaplanır — taksit satırı
// doğrudan düzenlenip amount_minor değişince bu trigger tetiklenmez. Taksit planı
// düzenlemesinde aynı kuralı burada, client tarafında uygularız: ödenen tutar
// (paidMinor) yeni tutardan büyük olamayacağı çağıran tarafta önceden doğrulanır
// (bkz. getPlanValidationError), bu fonksiyon yalnızca kalan/durumu yeniden türetir.
const RECOMPUTABLE_STATUSES = new Set([
  'bekliyor',
  'kismen_odendi',
  'odendi',
  'kismen_tahsil_edildi',
  'tahsil_edildi',
  'gecikti',
]);

export function recomputeInstallmentAfterAmountEdit(
  current: { amountMinor: number; remainingAmountMinor: number; status: string },
  newAmountMinor: number,
  direction: 'payable' | 'receivable'
): InstallmentEditRecompute {
  const paidMinor = Math.max(0, current.amountMinor - current.remainingAmountMinor);
  const remainingAmountMinor = Math.max(newAmountMinor - paidMinor, 0);

  let status = current.status;
  if (RECOMPUTABLE_STATUSES.has(current.status)) {
    if (paidMinor >= newAmountMinor && newAmountMinor > 0) {
      status = direction === 'payable' ? 'odendi' : 'tahsil_edildi';
    } else if (paidMinor > 0) {
      status = direction === 'payable' ? 'kismen_odendi' : 'kismen_tahsil_edildi';
    } else {
      status = 'bekliyor';
    }
  }

  return { amountMinor: newAmountMinor, remainingAmountMinor, status };
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
