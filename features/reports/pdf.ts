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
  violet: '#6B4DFF',
  ok: '#14804F',
  okBar: '#52CE96',
  bad: '#D23B35',
};

// Sayfalı düzen ölçüleri (CSS px = pt; sayfa A4 ile aynı 595 × 842).
const PAGE = { top: 40, side: 40, bottom: 78, footerBottom: 26 };

// Footer'ı her sayfanın en altına sabitlemek için içerik bölümleri sabit yükseklikli sayfalara
// yerleştirilir; sığmayan tablo satırlarıyla bölünür ve "(devam)" ile sonraki sayfaya geçer.
// iOS'ta (WKWebView) çalışır. Android'de expo-print'in WebView'ı betik çalıştırmaz; orada akış
// düzeni kalır ve footer içeriğin sonunda görünür.
const PAGINATE_JS = `(function () {
  var flow = document.getElementById('flow');
  var foot = document.getElementById('flow-ft');
  var pages = document.getElementById('pages');
  if (!flow || !foot || !pages) return;
  var queue = Array.prototype.slice.call(flow.children);
  var body;
  function newPage() {
    var page = document.createElement('div');
    page.className = 'page';
    body = document.createElement('div');
    body.className = 'page-body';
    page.appendChild(body);
    var f = foot.cloneNode(true);
    f.removeAttribute('id');
    page.appendChild(f);
    pages.appendChild(page);
  }
  function over() { return body.scrollHeight > body.clientHeight + 1; }
  function continuation(block, skip) {
    var rest = block.cloneNode(true);
    Array.prototype.slice.call(rest.children).forEach(function (c) {
      if (!c.classList.contains('sec-h') && c.tagName !== 'TABLE') rest.removeChild(c);
    });
    var h = rest.querySelector('h2');
    if (h && h.textContent.indexOf('(devam)') < 0) h.textContent += ' (devam)';
    var rows = rest.querySelectorAll('tbody tr');
    for (var i = 0; i < skip; i++) rows[i].parentNode.removeChild(rows[i]);
    return rest;
  }
  newPage();
  var guard = 0;
  while (queue.length && guard++ < 500) {
    var block = queue.shift();
    body.appendChild(block);
    if (!over()) continue;
    body.removeChild(block);
    var rows = block.querySelectorAll('tbody tr');
    if (rows.length > 1) {
      var piece = block.cloneNode(true);
      var tb = piece.querySelector('tbody');
      while (tb.firstChild) tb.removeChild(tb.firstChild);
      body.appendChild(piece);
      var fit = 0;
      for (var i = 0; i < rows.length; i++) {
        tb.appendChild(rows[i].cloneNode(true));
        if (over()) { tb.removeChild(tb.lastChild); break; }
        fit++;
      }
      if (fit >= 2 || (fit >= 1 && body.children.length === 1)) {
        if (fit < rows.length) queue.unshift(continuation(block, fit));
        if (queue.length) newPage();
        continue;
      }
      body.removeChild(piece);
    }
    if (body.children.length === 0) { body.appendChild(block); if (queue.length) newPage(); continue; }
    newPage();
    queue.unshift(block);
  }
  var all = pages.querySelectorAll('.page');
  for (var p = 0; p < all.length; p++) {
    var pg = all[p].querySelector('.pg');
    if (pg) pg.textContent = 'Sayfa ' + (p + 1) + ' / ' + all.length + ' · ';
  }
  var st = document.createElement('style');
  st.textContent = '@page { size: ${A4.width}px ${A4.height}px; margin: 0; }';
  document.head.appendChild(st);
  document.documentElement.className += ' paged';
})();`;

const money = (minor: number, currency = 'TRY') => formatMinorAmount(minor, currency);

// Marka sembolü (components/brand/VademdeMark.tsx ile aynı çizim). Kâğıt beyaz olduğu için "V" grafit,
// çubuklar marka renklerinde sabit.
function markSvg(height: number): string {
  // viewBox çizimin sınırlarına kırpılmıştır (orijinal 1024×980 tuvalde bol boşluk var).
  const width = Math.round(height * (620 / 820));
  return `<svg width="${width}" height="${height}" viewBox="202 80 620 820" xmlns="http://www.w3.org/2000/svg"><path fill="${C.ink}" d="M221.2,330.7l203.6,311.2c17.7,27.1,48,43.5,80.4,43.5h15.4c32.5,0,62.8-16.5,80.6-43.8l201.7-310.9h-80.7c-17.7,0-34.3,8.9-44.1,23.6l-159.8,240.2c-.8,1.2-2.1,1.9-3.6,1.9h-6c-1.4,0-2.8-.7-3.6-1.9l-156.3-237.6c-10.7-16.3-29-26.2-48.6-26.2h-79.1Z"/><g fill="${C.violet}"><rect x="490.3" y="725.1" width="43.4" height="164" rx="21.7"/><rect x="575.2" y="704.8" width="43.4" height="124.3" rx="21.7"/><rect x="405.3" y="695.3" width="43.4" height="140.9" rx="21.7"/></g><g fill="${C.saffron}"><rect x="404.7" y="231.9" width="43.4" height="185" rx="21.7"/><rect x="489.6" y="174.5" width="43.4" height="277.7" rx="21.7"/><path d="M617.4,341l-24.2,37.1c-2.2,3.3-5.9,5.3-9.8,5.3h-3c-3.2,0-5.8-2.6-5.8-5.8V112.8c0-12,9.8-21.8,21.8-21.8h0c12,0,21.7,9.7,21.8,21.7l1.2,221.9c0,2.3-.7,4.6-1.9,6.5Z"/></g></svg>`;
}

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

function kpi(label: string, value: string, tone: 'ink' | 'ok' | 'bad' = 'ink', sub?: string, dot?: string): string {
  return `<div class="kpi"><div class="kpi-l">${dot ? `<i style="background:${dot}"></i>` : ''}${esc(label)}</div><div class="kpi-v ${tone}">${esc(value)}</div>${sub ? `<div class="kpi-s">${esc(sub)}</div>` : ''}</div>`;
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

export function buildReportHtml(input: ReportPdfInput): string {
  const sec = input.sections ?? ALL_SECTIONS;
  const generatedAt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const net = input.incomeMinor - input.expenseMinor;
  const savings = input.incomeMinor > 0 ? Math.round((net / input.incomeMinor) * 100) : null;
  // Gider geliri aşınca "−%106 tasarruf" anlamsız; bunun yerine aşım oranı yazılır.
  const savingsKpi =
    savings === null
      ? kpi('Tasarruf oranı', '—', 'ink', 'Gelir kaydı yok')
      : savings < 0
        ? kpi('Tasarruf oranı', 'Tasarruf yok', 'ink', `Gider geliri %${Math.abs(savings)} aştı`)
        : kpi('Tasarruf oranı', `%${savings}`, 'ink', 'Gelirin kenara kalan kısmı');

  const parts: string[] = [];

  if (sec.summary) {
    parts.push(
      section(
        'Gelir ve gider özeti',
        `<div class="kpis">
          ${kpi('Gelir', money(input.incomeMinor), 'ok', undefined, C.okBar)}
          ${kpi('Gider', money(input.expenseMinor), 'ink', undefined, C.saffron)}
          ${kpi('Net', `${net < 0 ? '−' : ''}${money(Math.abs(net))}`, net < 0 ? 'bad' : 'ok', net < 0 ? 'Gider geliri aştı' : 'Gelir gideri aştı')}
          ${savingsKpi}
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

  .hd-top { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid ${C.line}; }
  .logo { display: flex; align-items: center; gap: 8px; }
  .logo svg { display: block; }
  .logo b { font-size: 14pt; font-weight: 700; letter-spacing: -0.03em; }
  .doc-type { font-size: 7.5pt; font-weight: 600; letter-spacing: 0.16em; color: ${C.ink2}; text-transform: uppercase; }
  .hd-main { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 18px 0 16px; }
  .eyebrow { font-size: 7.5pt; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: ${C.saffronText}; }
  h1 { font-size: 22pt; line-height: 1.1; margin: 4px 0 0; letter-spacing: -0.03em; font-weight: 700; }
  .hd-meta { display: flex; gap: 22px; margin: 0; }
  .hd-meta div { border-left: 2px solid ${C.line}; padding-left: 9px; }
  .hd-meta dt { font-size: 7.5pt; color: ${C.ink3}; text-transform: uppercase; letter-spacing: 0.06em; }
  .hd-meta dd { margin: 2px 0 0; font-size: 9.5pt; font-weight: 600; white-space: nowrap; }
  .hd-rule { display: flex; height: 3px; }
  .hd-rule i { width: 56px; background: ${C.saffron}; border-radius: 2px 0 0 2px; }
  .hd-rule s { flex: 1; background: ${C.ink}; border-radius: 0 2px 2px 0; }

  .sec { margin-top: 22px; break-inside: avoid; page-break-inside: avoid; }
  .sec-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  h2 { font-size: 11pt; margin: 0; letter-spacing: -0.01em; display: flex; align-items: center; gap: 7px; }
  h2::before { content: ''; width: 3px; height: 11px; border-radius: 2px; background: ${C.saffron}; }
  .note { font-size: 8pt; color: ${C.ink3}; }

  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid ${C.line}; border-bottom: 1px solid ${C.line}; }
  .kpis.three { grid-template-columns: repeat(3, 1fr); }
  .kpi { padding: 11px 12px; border-left: 1px solid ${C.line}; }
  .kpi:first-child { border-left: none; padding-left: 0; }
  .kpi-l { font-size: 7.5pt; font-weight: 600; color: ${C.ink2}; text-transform: uppercase; letter-spacing: 0.06em; display: flex; align-items: center; gap: 5px; }
  .kpi-l i { width: 6px; height: 6px; border-radius: 3px; display: inline-block; }
  .kpi-v { font-size: 14pt; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; white-space: nowrap; }
  .kpi-s { font-size: 7.5pt; color: ${C.ink3}; margin-top: 2px; }

  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { text-align: left; font-size: 8pt; font-weight: 600; color: ${C.ink2}; text-transform: uppercase; letter-spacing: 0.03em; padding: 6px 6px; border-bottom: 1px solid ${C.ink}; }
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

  .ft { margin-top: 28px; padding-top: 10px; border-top: 1px solid ${C.line}; display: flex; align-items: center; justify-content: space-between; gap: 16px; break-inside: avoid; page-break-inside: avoid; }
  .ft-l { display: flex; align-items: center; gap: 8px; }
  .ft-l svg { display: block; }
  .ft-l b { font-size: 8.5pt; display: block; letter-spacing: -0.01em; }
  .ft-l span { font-size: 7.5pt; color: ${C.ink3}; }
  .ft-r { font-size: 7.5pt; color: ${C.ink3}; text-align: right; white-space: nowrap; }
  .ft-r b { color: ${C.ink2}; font-weight: 600; }

  /* Sayfalı düzen (PAGINATE_JS çalışınca): her sayfa sabit ölçülü, footer sayfanın en altında. */
  .page { position: relative; width: ${A4.width}px; height: ${A4.height - 1}px; padding: ${PAGE.top}px ${PAGE.side}px 0; overflow: hidden; break-after: page; page-break-after: always; }
  .page:last-child { break-after: auto; page-break-after: auto; }
  .page-body { height: ${A4.height - 1 - PAGE.top - PAGE.bottom}px; overflow: hidden; }
  .page-body > .sec:first-child { margin-top: 0; }
  .page > .ft { position: absolute; left: ${PAGE.side}px; right: ${PAGE.side}px; bottom: ${PAGE.footerBottom}px; margin: 0; }
  .paged #flow, .paged #flow-ft { display: none; }
</style>
</head>
<body>
  <div id="flow">
  <header>
    <div class="hd-top">
      <div class="logo">${markSvg(30)}<b>Vademde</b></div>
      <div class="doc-type">Finans raporu</div>
    </div>
    <div class="hd-main">
      <div><div class="eyebrow">Rapor dönemi</div><h1>${esc(input.periodLabel)}</h1></div>
      <dl class="hd-meta">
        <div><dt>Çalışma alanı</dt><dd>${esc(input.workspaceName || 'Kişisel')}</dd></div>
        <div><dt>Oluşturulma</dt><dd>${esc(generatedAt)}</dd></div>
      </dl>
    </div>
    <div class="hd-rule"><i></i><s></s></div>
  </header>
  ${parts.join('\n')}
  </div>
  <footer class="ft" id="flow-ft">
    <div class="ft-l">${markSvg(20)}<div><b>Vademde ile oluşturuldu</b><span>Tutarlar uygulamaya kaydedilen verilerden hesaplanmıştır.</span></div></div>
    <div class="ft-r"><b class="pg"></b>${esc(input.workspaceName || 'Kişisel')} · ${esc(generatedAt)}</div>
  </footer>
  <div id="pages"></div>
  <script>${PAGINATE_JS}</script>
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
