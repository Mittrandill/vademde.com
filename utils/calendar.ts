// docs/03-bilgi-mimarisi-ekranlar.md §5.9 — Takvim ay grid'i Pazartesi başlangıçlı;
// gösterilen ay dışındaki taşan günler de vade göstergesi taşıyabildiği için
// grid, tam haftaları kapsayacak şekilde önceki/sonraki aya taşar.

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

// Pazartesi=0 ... Pazar=6 sıralı, ayın gösterildiği tüm haftaları dolduran grid.
export function getMonthGridWeeks(monthDate: Date): Date[][] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - firstWeekday);

  const lastOfMonth = new Date(year, month + 1, 0);
  const lastWeekday = (lastOfMonth.getDay() + 6) % 7;
  const gridEnd = new Date(year, month, lastOfMonth.getDate() + (6 - lastWeekday));

  const days: Date[] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}
