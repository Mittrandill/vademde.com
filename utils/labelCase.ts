// Form etiketleri tuvalde cümle düzeninde ("E-posta", "Vade tarihi") yazılır; eski çağrılar BÜYÜK HARFLE
// geçtiği için görüntülenirken Türkçe kurallarıyla ("İSTEĞE" → "isteğe") cümle düzenine çevrilir.
export function toSentenceLabel(label: string): string {
  if (label === label.toLocaleUpperCase('tr-TR') && /[A-ZÇĞİÖŞÜ]/.test(label)) {
    const lower = label.toLocaleLowerCase('tr-TR');
    return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1);
  }
  return label;
}
