import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { formatMinorAmount } from '@/utils/money';
import type {
  AccountBalanceReportItem,
  CashFlowBucket,
  CategoryBreakdownItem,
  CounterpartyBreakdownItem,
  MonthlyTotal,
} from '@/features/reports/api';
import type { ObligationWithRelations } from '@/features/obligations/api';

export interface ReportPdfInput {
  periodLabel: string;
  incomeMinor: number;
  expenseMinor: number;
  payableTotalMinor: number;
  payableCount: number;
  receivableTotalMinor: number;
  receivableCount: number;
  monthlyComparison: MonthlyTotal[];
  expenseCategories: CategoryBreakdownItem[];
  incomeCategories: CategoryBreakdownItem[];
  counterparties: CounterpartyBreakdownItem[];
  accountBalances: AccountBalanceReportItem[];
  overdueObligations: ObligationWithRelations[];
  cashFlow: CashFlowBucket[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCategoryRows(items: CategoryBreakdownItem[]): string {
  if (items.length === 0) return '<tr><td colspan="2" class="muted">Kayıt yok.</td></tr>';
  return items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.name)}</td><td class="amount">${formatMinorAmount(item.amountMinor)}</td></tr>`
    )
    .join('');
}

function renderCounterpartyRows(items: CounterpartyBreakdownItem[]): string {
  if (items.length === 0) return '<tr><td colspan="3" class="muted">Kayıt yok.</td></tr>';
  return items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.name)}</td><td>${item.count}</td><td class="amount">${formatMinorAmount(item.amountMinor)}</td></tr>`
    )
    .join('');
}

function renderAccountRows(items: AccountBalanceReportItem[]): string {
  if (items.length === 0) return '<tr><td colspan="2" class="muted">Hesap yok.</td></tr>';
  return items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.name)}</td><td class="amount">${formatMinorAmount(item.balanceMinor, item.currencyCode)}</td></tr>`
    )
    .join('');
}

function renderOverdueRows(items: ObligationWithRelations[]): string {
  if (items.length === 0) return '<tr><td colspan="3" class="muted">Gecikmiş kayıt yok.</td></tr>';
  return items
    .map(
      (o) =>
        `<tr><td>${escapeHtml(o.title)}</td><td>${o.due_date ?? ''}</td><td class="amount">${formatMinorAmount(o.remaining_amount_minor, o.currency_code)}</td></tr>`
    )
    .join('');
}

function renderMonthlyRows(items: MonthlyTotal[]): string {
  if (items.length === 0) return '<tr><td colspan="3" class="muted">Kayıt yok.</td></tr>';
  return items
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.label)}</td><td class="amount">${formatMinorAmount(m.incomeMinor)}</td><td class="amount">${formatMinorAmount(m.expenseMinor)}</td></tr>`
    )
    .join('');
}

function renderCashFlowRows(buckets: CashFlowBucket[]): string {
  return buckets
    .map(
      (b) =>
        `<tr><td>${escapeHtml(b.label)}</td><td class="amount">${formatMinorAmount(b.receivableMinor)}</td><td class="amount">${formatMinorAmount(b.payableMinor)}</td></tr>`
    )
    .join('');
}

function buildReportHtml(input: ReportPdfInput): string {
  const generatedAt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const netMinor = input.incomeMinor - input.expenseMinor;

  return `
<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1F2126; padding: 32px; }
  h1 { font-size: 24px; margin-bottom: 2px; }
  .subtitle { color: #6E6F66; font-size: 12px; margin-bottom: 24px; }
  h2 { font-size: 15px; margin-top: 28px; margin-bottom: 8px; border-bottom: 1px solid #E2E2DC; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 6px 4px; border-bottom: 1px solid #F0F0EC; }
  td.amount { text-align: right; font-variant-numeric: tabular-nums; }
  td.muted { color: #6E6F66; font-style: italic; }
  .summary-grid { display: flex; gap: 16px; margin-top: 8px; }
  .summary-cell { flex: 1; border: 1px solid #E2E2DC; border-radius: 10px; padding: 10px 12px; }
  .summary-label { font-size: 10px; color: #6E6F66; text-transform: uppercase; letter-spacing: 0.04em; }
  .summary-value { font-size: 16px; font-weight: 700; margin-top: 2px; }
  .positive { color: #1F8A5C; }
  .negative { color: #C43D33; }
</style>
</head>
<body>
  <h1>Vademde Rapor</h1>
  <div class="subtitle">${escapeHtml(input.periodLabel)} · Oluşturulma: ${escapeHtml(generatedAt)}</div>

  <h2>Gelir - Gider Özeti</h2>
  <div class="summary-grid">
    <div class="summary-cell">
      <div class="summary-label">Gelir</div>
      <div class="summary-value positive">${formatMinorAmount(input.incomeMinor)}</div>
    </div>
    <div class="summary-cell">
      <div class="summary-label">Gider</div>
      <div class="summary-value">${formatMinorAmount(input.expenseMinor)}</div>
    </div>
    <div class="summary-cell">
      <div class="summary-label">Net</div>
      <div class="summary-value ${netMinor >= 0 ? 'positive' : 'negative'}">${formatMinorAmount(Math.abs(netMinor))}</div>
    </div>
  </div>

  <h2>Borç / Alacak Özeti</h2>
  <div class="summary-grid">
    <div class="summary-cell">
      <div class="summary-label">Borç (${input.payableCount} kayıt)</div>
      <div class="summary-value">${formatMinorAmount(input.payableTotalMinor)}</div>
    </div>
    <div class="summary-cell">
      <div class="summary-label">Alacak (${input.receivableCount} kayıt)</div>
      <div class="summary-value positive">${formatMinorAmount(input.receivableTotalMinor)}</div>
    </div>
  </div>

  <h2>Aylık Karşılaştırma</h2>
  <table>
    <tr><td><b>Ay</b></td><td class="amount"><b>Gelir</b></td><td class="amount"><b>Gider</b></td></tr>
    ${renderMonthlyRows(input.monthlyComparison)}
  </table>

  <h2>Kategori Bazlı Gider</h2>
  <table>${renderCategoryRows(input.expenseCategories)}</table>

  <h2>Kategori Bazlı Gelir</h2>
  <table>${renderCategoryRows(input.incomeCategories)}</table>

  <h2>Kişi / Firma Bazlı Hareketler</h2>
  <table>
    <tr><td><b>Ad</b></td><td><b>Hareket</b></td><td class="amount"><b>Tutar</b></td></tr>
    ${renderCounterpartyRows(input.counterparties)}
  </table>

  <h2>Hesap Bakiyeleri</h2>
  <table>${renderAccountRows(input.accountBalances)}</table>

  <h2>Gecikmiş Ödemeler</h2>
  <table>
    <tr><td><b>Başlık</b></td><td><b>Vade</b></td><td class="amount"><b>Tutar</b></td></tr>
    ${renderOverdueRows(input.overdueObligations)}
  </table>

  <h2>Beklenen Nakit Akışı (30 Gün)</h2>
  <table>
    <tr><td><b>Dönem</b></td><td class="amount"><b>Alacak</b></td><td class="amount"><b>Borç</b></td></tr>
    ${renderCashFlowRows(input.cashFlow)}
  </table>
</body>
</html>`;
}

// docs/12-mvp-kabul-kriterleri.md — "Raporlar PDF ve CSV olarak dışa aktarılır."
export async function exportReportPdf(input: ReportPdfInput): Promise<void> {
  const html = buildReportHtml(input);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Vademde Raporu' });
  }
}
