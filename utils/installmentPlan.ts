export interface InstallmentPlanItem {
  installmentNumber: number;
  dueDate: string;
  amountMinor: number;
  principalMinor: number;
  interestMinor: number;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

// Taksit planı düzenlemesinde "başlangıç tarihi" değiştiğinde tüm ödenmemiş taksitleri
// aynı aylık kadansla yeniden dizmek için (bkz. app/obligations/new.tsx InstallmentPlanEditor)
// ve vade planı üretirken (buildFixedInstallments/buildAmortizedInstallments) kullanılır.
//
// Date.setMonth bilerek kullanılmaz, iki nedenle:
// 1) setMonth ayın son gününü taşırır: 31 Ocak + 1 ay = 3 Mart olur ve Şubat tamamen atlanır.
//    Maaş/kira gibi ay sonunda ödenen tekrarlayan kayıtlarda plan bu yüzden bozuluyordu.
//    Burada gün, hedef ayın gün sayısına kırpılır (31 Ocak + 1 ay = 28/29 Şubat).
// 2) new Date('YYYY-MM-DD') UTC gece yarısı olarak ayrıştırılır ama setMonth/toISOString
//    yerel saate göre çalışır; UTC farkı negatif olan cihazlarda tarih bir gün geri kayardı.
//    Aşağıdaki hesap tamamen tam sayı aritmetiğidir, saat diliminden etkilenmez.
export function addMonthsToIsoDate(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonthIndex = target.getUTCMonth();
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonthIndex));
  return [
    String(targetYear).padStart(4, '0'),
    String(targetMonthIndex + 1).padStart(2, '0'),
    String(clampedDay).padStart(2, '0'),
  ].join('-');
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

  const fixedPaymentMinor =
    rate === 0
      ? Math.round(principalMinor / count)
      : Math.round((principalMinor * rate * (1 + rate) ** count) / ((1 + rate) ** count - 1));

  let remainingMinor = principalMinor;

  return Array.from({ length: count }, (_, index) => {
    const dueDate = addMonthsToIsoDate(firstDueDate, index);
    const isLast = index === count - 1;

    const interestMinor = Math.round(remainingMinor * rate);
    const principalMinorForInstallment = isLast
      ? remainingMinor
      : Math.min(Math.max(fixedPaymentMinor - interestMinor, 0), remainingMinor);
    remainingMinor = isLast ? 0 : remainingMinor - principalMinorForInstallment;

    return {
      installmentNumber: index + 1,
      dueDate,
      amountMinor: principalMinorForInstallment + interestMinor,
      principalMinor: principalMinorForInstallment,
      interestMinor,
    };
  });
}

// Maaş, kira, abonelik, vergi/SGK gibi tekrarlayan kayıtlarda girilen tutar TOPLAM değil
// HER VADENİN tutarıdır: 4 ay × 28.075,50 ₺ dört ayrı 28.075,50 ₺ vade demektir, toplamın
// dörde bölünmesi değil (bkz. app/obligations/new.tsx amountMode). buildAmortizedInstallments'tan
// ayrı bir fonksiyon olmasının nedeni: orada tutar bölündüğü için son vadeye kuruş artığı
// bindirilir — burada her vade birebir aynı kalmalıdır, yuvarlama artığı hiç oluşmaz.
// Faiz kavramı yoktur (tekrarlayan sabit ödeme anapara/faize ayrılmaz), principal = tutar.
export function buildFixedInstallments(
  amountPerInstallmentMinor: number,
  count: number,
  firstDueDate: string
): InstallmentPlanItem[] {
  return Array.from({ length: count }, (_, index) => ({
    installmentNumber: index + 1,
    dueDate: addMonthsToIsoDate(firstDueDate, index),
    amountMinor: amountPerInstallmentMinor,
    principalMinor: amountPerInstallmentMinor,
    interestMinor: 0,
  }));
}
