// Kayıt adları Türkçe olduğu için küçültme de Türkçe kurallarıyla yapılır: varsayılan
// toLowerCase() "İSTANBUL" → "i̇stanbul" üretip "istanbul" aramasını kaçırır, "IŞIK" → "ışık"
// dönüşümünü de yapamaz.
export function normalizeForSearch(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR');
}

export function matchesSearch(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  if (!haystack) return false;
  return normalizeForSearch(haystack).includes(needle);
}
