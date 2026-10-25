import type { reminderMessages as tr } from '../tr/reminderMessages';
import type { Messages } from '../../types';

export const reminderMessages: Messages<typeof tr> = {
  stages: {
    '7_days_before': "In 7 Days",
    '3_days_before': "In 3 Days",
    due_day: "Today",
    overdue_1_day: "1 Day Overdue",
  },
  payable: {
    kredi: "Loan Payment",
    kredi_karti_ekstresi: "Credit Card Payment",
    nakit_avans: "Cash Advance Payment",
    cek: "Check Payment",
    senet: "Promissory Note Payment",
    fatura: "Invoice Payment",
    abonelik: "Subscription Payment",
    kira: "Rent Payment",
    maas: "Salary Payment",
    vergi_sgk: "Tax / Social Security Payment",
    tedarikci_borcu: "Supplier Payment",
    sozlesme_odeme_plani: "Contract Payment",
  },
  receivable: {
    cek: "Check Collection",
    senet: "Promissory Note Collection",
    borc_verme: "Loan Repayment Collection",
    musteri_alacagi: "Customer Collection",
    kira: "Rent Collection",
  },
  payment: "Payment",
  collection: "Collection",
  paymentTitle: "Payment Reminder",
  collectionTitle: "Collection Reminder",
  body: "{{subject}} · {{noun}} of {{amount}} · {{when}}",
};
