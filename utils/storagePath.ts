const TURKISH_CHAR_MAP: Record<string, string> = {
  ç: 'c', Ç: 'C',
  ğ: 'g', Ğ: 'G',
  ı: 'i', İ: 'I',
  ö: 'o', Ö: 'O',
  ş: 's', Ş: 'S',
  ü: 'u', Ü: 'U',
};

// Supabase Storage anahtarları boşluk ve Türkçe harfler gibi ASCII dışı karakterlerde
// "Invalid key" hatası verebiliyor. Görüntülenen dosya adı (financial_documents.file_name)
// olduğu gibi kalır; yalnızca storage path için güvenli bir sürüm üretilir.
export function sanitizeStorageFileName(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  const hasExtension = lastDotIndex > 0 && lastDotIndex < fileName.length - 1;
  const base = hasExtension ? fileName.slice(0, lastDotIndex) : fileName;
  const extension = hasExtension ? fileName.slice(lastDotIndex + 1) : '';

  const transliterated = base
    .split('')
    .map((char) => TURKISH_CHAR_MAP[char] ?? char)
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  const safeBase = transliterated
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const safeExtension = extension.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();

  return safeExtension ? `${safeBase || 'belge'}.${safeExtension}` : safeBase || 'belge';
}
