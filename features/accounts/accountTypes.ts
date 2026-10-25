import { t } from '@/i18n';
import { localizedRecord } from '@/i18n/localized';

// Hesap türü kodu -> görünen ad (Kasa, Banka, Kredi Kartı, Cüzdan, POS); i18n domain.accountTypes.
export const ACCOUNT_TYPE_LABEL: Record<string, string> = localizedRecord(
  ['bank', 'credit_card', 'cash', 'wallet', 'pos'] as const,
  (type) => t(`domain.accountTypes.${type}`)
);
