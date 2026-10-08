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
  /** Raporun ait olduğu çalışma alanı (başlıkta). */
  workspaceName?: string | null;
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
  /** Dışa aktarma sheet'inde seçilen bölümler; verilmezse hepsi dahildir. */
  sections?: ReportPdfSections;
}

export interface ReportPdfSections {
  summary: boolean;
  categories: boolean;
  counterparties: boolean;
  obligations: boolean;
  accounts: boolean;
}

const ALL_SECTIONS: ReportPdfSections = {
  summary: true,
  categories: true,
  counterparties: true,
  obligations: true,
  accounts: true,
};

// A4 = 210 × 297 mm = 595 × 842 pt (expo-print birimi). Kenar boşlukları @page ile verilir.
const A4 = { width: 595, height: 842 };

// Uygulama tokenları (theme/colors.ts açık tema) — kâğıtta okunur, mürekkep dostu.
const C = {
  ink: '#1F2126',
  ink2: '#6E6F66',
  ink3: '#8E8F86',
  line: '#E9E9E3',
  fill: '#F6F5F1',
  graphite: '#2B2D31',
  saffron: '#FFB000',
  saffronText: '#8A5F00',
  ok: '#14804F',
  okBar: '#52CE96',
  bad: '#D23B35',
};

const money = (minor: number, currency = 'TRY') => formatMinorAmount(minor, currency);

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });

function daysOverdue(due: string | null): number | null {
  if (!due) return null;
  const d = new Date(due);
  const today = new Date();
  const diff = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000
  );
  return Math.max(0, diff);
}

/** Bölüm: başlık + isteğe bağlı açıklama + gövde; sayfa sonunda bölünmez. */
function section(title: string, body: string, note?: string): string {
  return `<section class="sec"><div class="sec-h"><h2>${esc(title)}</h2>${note ? `<span class="note">${esc(note)}</span>` : ''}</div>${body}</section>`;
}

function kpi(label: string, value: string, tone: 'ink' | 'ok' | 'bad' = 'ink', sub?: string): string {
  return `<div class="kpi"><div class="kpi-l">${esc(label)}</div><div class="kpi-v ${tone}">${esc(value)}</div>${sub ? `<div class="kpi-s">${esc(sub)}</div>` : ''}</div>`;
}

function table(head: string[], rows: string[][], alignRight: number[] = [], empty = 'Kayıt yok.'): string {
  const th = head.map((h, i) => `<th class="${alignRight.includes(i) ? 'r' : ''}">${esc(h)}</th>`).join('');
  const body =
    rows.length === 0
      ? `<tr><td colspan="${head.length}" class="muted">${esc(empty)}</td></tr>`
      : rows.map((r) => `<tr>${r.map((c, i) => `<td class="${alignRight.includes(i) ? 'r num' : ''}">${c}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

// Son 6 ay: gelir (yeşil) ve gider (Saffron) çift sütun, kılavuz çizgili satır içi SVG.
function monthChart(items: MonthlyTotal[]): string {
  if (items.length === 0) return '';
  const w = 515;
  const h = 150;
  const axis = 44;
  const plotH = 118;
  const max = Math.max(1, ...items.flatMap((m) => [m.incomeMinor, m.expenseMinor]));
  const slot = (w - axis) / items.length;
  const barW = Math.min(18, slot / 3);
  const y = (v: number) => 6 + plotH - (v / max) * plotH;
  const grid = [0, 0.5, 1]
    .map((f) => {
      const gy = 6 + plotH - f * plotH;
      return `<line x1="${axis}" y1="${gy}" x2="${w}" y2="${gy}" stroke="${C.line}" stroke-width="1"/><text x="${axis - 6}" y="${gy + 3}" text-anchor="end" font-size="8" fill="${C.ink3}">${esc(money(Math.round(max * f)).replace(/,\d{2}(?=\D*$)/, ''))}</text>`;
    })
    .join('');
  const bars = items
    .map((m, i) => {
      const cx = axis + slot * i + slot / 2;
      return `<rect x="${cx - barW - 1.5}" y="${y(m.incomeMinor)}" width="${barW}" height="${6 + plotH - y(m.incomeMinor)}" rx="2" fill="${C.okBar}"/><rect x="${cx + 1.5}" y="${y(m.expenseMinor)}" width="${barW}" height="${6 + plotH - y(m.expenseMinor)}" rx="2" fill="${C.saffron}"/><text x="${cx}" y="${h - 6}" text-anchor="middle" font-size="9" fill="${C.ink2}">${esc(m.label)}</text>`;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${grid}${bars}</svg>
  <div class="legend"><span><i style="background:${C.okBar}"></i>Gelir</span><span><i style="background:${C.saffron}"></i>Gider</span></div>`;
}

function categoryTable(items: CategoryBreakdownItem[], barColor: string): string {
  return table(
    ['Kategori', 'Pay', 'Tutar'],
    items.map((c) => {
      const pct = Math.round(c.percentage * 100);
      return [
        esc(c.name),
        `<div class="pbar"><div class="pbar-t"><div class="pbar-f" style="width:${Math.max(2, pct)}%;background:${barColor}"></div></div><span>%${pct}</span></div>`,
        money(c.amountMinor),
      ];
    }),
    [2]
  );
}

function buildReportHtml(input: ReportPdfInput): string {
  const sec = input.sections ?? ALL_SECTIONS;
  const generatedAt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const net = input.incomeMinor - input.expenseMinor;
  const savings = input.incomeMinor > 0 ? Math.round((net / input.incomeMinor) * 100) : null;

  const parts: string[] = [];

  if (sec.summary) {
    parts.push(
      section(
        'Gelir ve gider özeti',
        `<div class="kpis">
          ${kpi('Gelir', money(input.incomeMinor), 'ok')}
          ${kpi('Gider', money(input.expenseMinor))}
          ${kpi('Net', `${net < 0 ? '−' : ''}${money(Math.abs(net))}`, net < 0 ? 'bad' : 'ok', net < 0 ? 'Gider geliri aştı' : 'Gelir gideri aştı')}
          ${kpi('Tasarruf oranı', savings === null ? '—' : `%${savings}`, 'ink', savings === null ? 'Gelir kaydı yok' : undefined)}
        </div>`
      )
    );
    parts.push(
      section(
        'Son 6 ay',
        monthChart(input.monthlyComparison) +
          table(
            ['Ay', 'Gelir', 'Gider', 'Net'],
            input.monthlyComparison.map((m) => {
              const n = m.incomeMinor - m.expenseMinor;
              return [esc(m.label), money(m.incomeMinor), money(m.expenseMinor), `<b class="${n < 0 ? 'bad' : ''}">${n < 0 ? '−' : ''}${money(Math.abs(n))}</b>`];
            }),
            [1, 2, 3]
          ),
        'Seçili dönemden bağımsız, son 6 takvim ayı'
      )
    );
  }

  if (sec.categories) {
    parts.push(section('Giderler · kategoriye göre', categoryTable(input.expenseCategories, C.saffron)));
    parts.push(section('Gelirler · kategoriye göre', categoryTable(input.incomeCategories, C.okBar)));
  }

  if (sec.obligations) {
    parts.push(
      section(
        'Borç ve alacak',
        `<div class="kpis three">
          ${kpi('Ödenecek', money(input.payableTotalMinor), 'ink', `${input.payableCount} açık kayıt`)}
          ${kpi('Tahsil edilecek', money(input.receivableTotalMinor), 'ok', `${input.receivableCount} açık kayıt`)}
          ${kpi('Gecikmiş', money(input.overdueObligations.reduce((s, o) => s + o.remaining_amount_minor, 0)), input.overdueObligations.length > 0 ? 'bad' : 'ink', `${input.overdueObligations.length} kayıt`)}
        </div>`,
        'Rapor tarihindeki açık kayıtlar'
      )
    );
    parts.push(
      section(
        'Gecikmiş ödemeler',
        table(
          ['Kayıt', 'Kişi / firma', 'Vade', 'Gecikme', 'Kalan'],
          input.overdueObligations.map((o) => [
            esc(o.title),
            esc(o.counterparty?.name ?? '—'),
            o.due_date ? dateFmt.format(new Date(o.due_date)) : '—',
            `${daysOverdue(o.due_date) ?? 0} gün`,
            `<b class="bad">${money(o.remaining_amount_minor, o.currency_code)}</b>`,
          ]),
          [3, 4],
          'Gecikmiş kayıt yok.'
        )
      )
    );
    parts.push(
      section(
        'Beklenen nakit akışı',
        table(
          ['Dönem', 'Giriş', 'Çıkış', 'Net'],
          input.cashFlow.map((b) => {
            const n = b.receivableMinor - b.payableMinor;
            return [esc(b.label), money(b.receivableMinor), money(b.payableMinor), `<b class="${n < 0 ? 'bad' : 'ok'}">${n < 0 ? '−' : '+'}${money(Math.abs(n))}</b>`];
          }),
          [1, 2, 3]
        ),
        'Önümüzdeki 30 gün'
      )
    );
  }

  if (sec.counterparties) {
    parts.push(
      section(
        'Kişi ve firmalar',
        table(
          ['Ad', 'Hareket', 'Tutar'],
          input.counterparties.map((c) => [esc(c.name), String(c.count), money(c.amountMinor)]),
          [1, 2]
        )
      )
    );
  }

  if (sec.accounts) {
    const tryTotal = input.accountBalances.filter((a) => a.currencyCode === 'TRY').reduce((s, a) => s + a.balanceMinor, 0);
    parts.push(
      section(
        'Hesap bakiyeleri',
        table(
          ['Hesap', 'Bakiye'],
          [
            ...input.accountBalances.map((a) => [esc(a.name), `<span class="${a.balanceMinor < 0 ? 'bad' : ''}">${money(a.balanceMinor, a.currencyCode)}</span>`]),
            ...(input.accountBalances.length > 1 ? [['<b>Toplam (TL hesaplar)</b>', `<b>${money(tryTotal)}</b>`]] : []),
          ],
          [1],
          'Hesap yok.'
        )
      )
    );
  }

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${A4.width}" />
<style>
  @page { size: A4; margin: 14mm 14mm 16mm 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: ${C.ink}; font-size: 10pt; line-height: 1.4;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .num, td.r { font-variant-numeric: tabular-nums; }

  .band { background: ${C.graphite}; color: #F6F5F1; border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
  .mark { width: 34px; height: 34px; border-radius: 9px; background: ${C.saffron}; color: ${C.graphite}; font-weight: 800; font-size: 20px; display: flex; align-items: center; justify-content: center; }
  .brand { flex: 1; }
  .brand b { font-size: 15pt; letter-spacing: -0.02em; display: block; }
  .brand span { font-size: 9pt; color: #B1B2AA; }
  .meta { text-align: right; font-size: 9pt; color: #B1B2AA; }
  .meta b { color: #F6F5F1; font-size: 11pt; display: block; }

  .sec { margin-top: 18px; break-inside: avoid; page-break-inside: avoid; }
  .sec-h { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 1.5px solid ${C.ink}; padding-bottom: 4px; margin-bottom: 8px; }
  h2 { font-size: 11.5pt; margin: 0; letter-spacing: -0.01em; }
  .note { font-size: 8pt; color: ${C.ink3}; }

  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .kpis.three { grid-template-columns: repeat(3, 1fr); }
  .kpi { background: ${C.fill}; border-radius: 8px; padding: 9px 10px; }
  .kpi-l { font-size: 8pt; color: ${C.ink2}; text-transform: uppercase; letter-spacing: 0.04em; }
  .kpi-v { font-size: 13pt; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
  .kpi-s { font-size: 8pt; color: ${C.ink3}; margin-top: 1px; }

  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { text-align: left; font-size: 8pt; font-weight: 600; color: ${C.ink2}; text-transform: uppercase; letter-spacing: 0.03em; padding: 5px 6px; border-bottom: 1px solid ${C.line}; }
  td { padding: 6px; border-bottom: 1px solid ${C.line}; vertical-align: middle; }
  th.r, td.r { text-align: right; white-space: nowrap; }
  td.muted { color: ${C.ink3}; font-style: italic; }
  tbody tr:last-child td { border-bottom: none; }

  .chart { display: block; margin: 2px 0 4px; }
  .legend { display: flex; gap: 14px; font-size: 8pt; color: ${C.ink2}; margin-bottom: 6px; }
  .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 4px; margin-right: 5px; vertical-align: middle; }

  .pbar { display: flex; align-items: center; gap: 6px; }
  .pbar-t { flex: 1; height: 5px; background: ${C.fill}; border-radius: 3px; overflow: hidden; max-width: 140px; }
  .pbar-f { height: 5px; border-radius: 3px; }
  .pbar span { font-size: 8pt; color: ${C.ink2}; width: 30px; text-align: right; font-variant-numeric: tabular-nums; }

  .ok { color: ${C.ok}; }
  .bad { color: ${C.bad}; }
  .ink { color: ${C.ink}; }

  .foot { margin-top: 22px; padding-top: 8px; border-top: 1px solid ${C.line}; font-size: 8pt; color: ${C.ink3}; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="band">
    <div class="mark">V</div>
    <div class="brand"><b>Finans raporu</b><span>${esc(input.workspaceName || 'Vademde')}</span></div>
    <div class="meta"><b>${esc(input.periodLabel)}</b>${esc(generatedAt)}</div>
  </div>
  ${parts.join('\n')}
  <div class="foot"><span>Vademde ile oluşturuldu · Tutarlar kayıtlı verilerden hesaplanmıştır.</span><span>${esc(generatedAt)}</span></div>
</body>
</html>`;
}

// docs/12-mvp-kabul-kriterleri.md — "Raporlar PDF ve CSV olarak dışa aktarılır."
export async function exportReportPdf(input: ReportPdfInput): Promise<void> {
  const html = buildReportHtml(input);
  const { uri } = await Print.printToFileAsync({ html, base64: false, width: A4.width, height: A4.height });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Vademde Raporu', UTI: 'com.adobe.pdf' });
  }
}
