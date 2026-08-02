const dayFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });

export interface DaySection<T> {
  title: string;
  data: T[];
}

// Hareket listelerini banka ekstresi gibi güne göre gruplar. Girdinin zaten occurred_at'e
// göre azalan sırada geldiğini varsayar (bkz. listTransactions) — burada yeniden sıralama
// yapılmaz, yalnızca aynı günün ardışık kayıtları tek başlık altında toplanır.
export function groupByDay<T>(items: T[], getDate: (item: T) => string): DaySection<T>[] {
  const sections: DaySection<T>[] = [];
  let currentKey = '';

  for (const item of items) {
    const key = dayFormatter.format(new Date(getDate(item)));
    if (key !== currentKey) {
      sections.push({ title: key, data: [item] });
      currentKey = key;
    } else {
      sections[sections.length - 1].data.push(item);
    }
  }

  return sections;
}
