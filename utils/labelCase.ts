import { getLocaleTag } from '@/i18n';

// Form etiketleri tuvalde cümle düzeninde ("E-posta", "Vade tarihi") yazılır; eski çağrılar BÜYÜK HARFLE
// geçtiği için görüntülenirken uygulama dilinin kurallarıyla (Türkçede "İSTEĞE" → "isteğe") cümle düzenine çevrilir.
export function toSentenceLabel(label: string): string {
  if (label === label.toLocaleUpperCase(getLocaleTag()) && /[A-ZÇĞİÖŞÜ]/.test(label)) {
    const lower = label.toLocaleLowerCase(getLocaleTag());
    return lower.charAt(0).toLocaleUpperCase(getLocaleTag()) + lower.slice(1);
  }
  return label;
}
