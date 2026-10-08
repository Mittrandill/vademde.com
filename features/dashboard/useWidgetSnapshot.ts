import { useEffect } from 'react';

import type { ObligationDueItem } from '@/features/obligations/api';
import { DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import { sumToReferenceMinor, type ValueUnitRate } from '@/features/valueUnits/api';
import { formatMinorAmount } from '@/utils/money';
import { writeWidgetSnapshot, type WidgetDueItem } from '@/services/widgetSync';

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const MAX_ITEMS = 4;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

// Widget'larda kuruşsuz kısa gösterim ("₺48.250"); "₺1.234,50" gibi kuruşlu tutar korunur.
function trimZeroDecimals(text: string): string {
  return text.replace(/,00(?=\D*$)/, '');
}

function compactNet(minor: number): string {
  const value = Math.abs(minor) / 100;
  const sign = minor < 0 ? '−' : '+';
  if (value >= 1_000_000) return `${sign}${(value / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '')}M`;
  if (value >= 1_000) return `${sign}${Math.round(value / 1_000)}K`;
  return `${sign}${Math.round(value)}`;
}

interface Input {
  workspaceId: string | null;
  workspaceName: string | null;
  enabled: boolean;
  obligations: ObligationDueItem[];
  rates: ValueUnitRate[];
  totalBalanceMinor: number;
  payableTotalMinor: number;
  receivableTotalMinor: number;
  monthNetMinor: number;
}

// Ana Sayfa'nın zaten çektiği verilerden widget özetini üretip App Group'a yazar.
// Yalnızca aktif çalışma alanı; veri gelmeden (enabled=false) önceki boş değerler yazılmaz.
export function useWidgetSnapshot(input: Input) {
  const {
    workspaceId,
    workspaceName,
    enabled,
    obligations,
    rates,
    totalBalanceMinor,
    payableTotalMinor,
    receivableTotalMinor,
    monthNetMinor,
  } = input;

  useEffect(() => {
    if (!enabled || !workspaceId) return;
    const today = startOfDay(new Date());

    const open = obligations
      .filter((o) => o.remaining_amount_minor > 0 && !!o.due_date)
      .map((o) => ({ o, diff: Math.round((startOfDay(new Date(o.due_date as string)).getTime() - today.getTime()) / DAY_MS) }))
      .sort((a, b) => a.diff - b.diff);

    const items: WidgetDueItem[] = open.slice(0, MAX_ITEMS).map(({ o, diff }) => ({
      title: o.counterparty?.name || o.title,
      kind: DOCUMENT_TYPE_LABEL[o.document_type] ?? 'Kayıt',
      date: dayKey(startOfDay(new Date(o.due_date as string))),
      amount: trimZeroDecimals(formatMinorAmount(o.remaining_amount_minor, o.currency_code)),
      receivable: o.direction === 'receivable',
      overdue: o.status === 'gecikti' || diff < 0,
      // Widget'ta banka logosu (targets/widget: "bank_<kod>" görseli); yoksa yön oku gösterilir.
      ...(o.bank_code ? { bank: o.bank_code } : {}),
    }));

    const inWeek = open.filter(({ diff }) => diff <= WEEK_DAYS);
    const sumWeek = (direction: 'payable' | 'receivable') =>
      sumToReferenceMinor(
        inWeek
          .filter(({ o }) => o.direction === direction)
          .map(({ o }) => ({ amountMinor: o.remaining_amount_minor, unitCode: o.currency_code })),
        rates
      );
    const weekPayableMinor = sumWeek('payable');
    const weekReceivableMinor = sumWeek('receivable');
    const fmt = (minor: number) => trimZeroDecimals(formatMinorAmount(minor, 'TRY'));

    writeWidgetSnapshot({
      v: 1,
      workspaceId,
      workspaceName: workspaceName ?? '',
      updatedAt: Date.now(),
      balance: fmt(totalBalanceMinor),
      receivable: fmt(receivableTotalMinor),
      payable: fmt(payableTotalMinor),
      monthNet: fmt(monthNetMinor),
      monthNetShort: compactNet(monthNetMinor),
      weekPayable: fmt(weekPayableMinor),
      weekReceivable: fmt(weekReceivableMinor),
      weekPayableMinor,
      weekReceivableMinor,
      items,
    });
  }, [
    enabled,
    workspaceId,
    workspaceName,
    obligations,
    rates,
    totalBalanceMinor,
    payableTotalMinor,
    receivableTotalMinor,
    monthNetMinor,
  ]);
}
