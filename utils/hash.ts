// docs/12-mvp-kabul-kriterleri.md — "Aynı belge tekrar yüklendiğinde mükerrer uyarısı gösterilir."
// Kriptografik olmayan FNV-1a 32-bit; amaç güvenlik değil, aynı dosyanın tekrar
// yüklenip yüklenmediğini tespit etmek olduğundan native bir crypto modülüne gerek yok.
// Math.imul ile 32-bit taşma güvenli çarpım yapılır (BigInt'ten çok daha hızlı).
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function hashArrayBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, FNV_PRIME);
  }
  return `${bytes.length.toString(16)}-${(hash >>> 0).toString(16)}`;
}
