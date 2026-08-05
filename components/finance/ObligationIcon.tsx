import { DOCUMENT_TYPE_ICON } from '@/features/obligations/documentTypes';
import { BankLogo } from './BankLogo';
import { ServiceLogo } from './ServiceLogo';

export interface ObligationIconProps {
  documentType: string;
  bankCode?: string | null;
  serviceCode?: string | null;
  /** abonelik kaydında service_code eşleşmesi yoksa kaydın başlığından baş harfli avatar
   * türetmek için kullanılır (bkz. ServiceLogo). */
  fallbackName?: string | null;
  size?: number;
}

// Kredi, kredi kartı ekstresi ve çek gibi banka kaynaklı kayıtlarda banka logosunu,
// abonelik kayıtlarında servis logosunu (Netflix, YouTube, Claude vb.), diğerlerinde
// mevcut belge türü ikonunu gösterir.
export function ObligationIcon({ documentType, bankCode, serviceCode, fallbackName, size = 32 }: ObligationIconProps) {
  if (documentType === 'abonelik') {
    return (
      <ServiceLogo
        serviceCode={serviceCode}
        fallbackName={fallbackName}
        size={size}
        fallbackIcon={DOCUMENT_TYPE_ICON[documentType] ?? 'repeat-outline'}
      />
    );
  }
  return (
    <BankLogo
      bankCode={bankCode}
      size={size}
      fallbackIcon={DOCUMENT_TYPE_ICON[documentType] ?? 'document-text-outline'}
    />
  );
}
