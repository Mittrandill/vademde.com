import type { PostgrestError } from '@supabase/supabase-js';

// Supabase tek istekte en fazla 1.000 satır döndürür; sınırsız okunan toplam/bakiye sorguları bu
// sınırı aşınca sessizce eksik veriyle hesaplardı. Sorgu kurucusu her sayfa için `range` uygulanmış
// bir sorgu döndürür; sayfa sayfa okunup birleştirilir. Kararlı sayfalama için sorgu bir benzersiz
// sütuna (ör. `id`) göre sıralanmış olmalıdır.
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await build(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
  throw new Error('Veri hacmi güvenli okuma sınırını aştı; eksik toplam gösterilmedi.');
}
