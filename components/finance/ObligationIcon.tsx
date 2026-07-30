import { DOCUMENT_TYPE_ICON } from '@/features/obligations/documentTypes';
import { BankLogo } from './BankLogo';

export interface ObligationIconProps {
  documentType: string;
  bankCode?: string | null;
  size?: number;
}

// Kredi, kredi kartı ekstresi ve çek gibi banka kaynaklı kayıtlarda banka logosunu,
// bankası olmayan/atanmamış kayıtlarda ise mevcut belge türü ikonunu gösterir.
export function ObligationIcon({ documentType, bankCode, size = 32 }: ObligationIconProps) {
  return (
    <BankLogo
      bankCode={bankCode}
      size={size}
      fallbackIcon={DOCUMENT_TYPE_ICON[documentType] ?? 'document-text-outline'}
    />
  );
}
