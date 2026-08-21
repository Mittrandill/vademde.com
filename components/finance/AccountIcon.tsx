import type { Ionicons } from '@expo/vector-icons';

import { BankLogo } from './BankLogo';
import { ValueUnitBadge } from './ValueUnitPicker';

// Hesaplar listesindeki (app/accounts/index.tsx) aynı tür-bazlı ikon eşlemesi.
const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  bank: 'business-outline',
  credit_card: 'card-outline',
  wallet: 'wallet-outline',
  pos: 'storefront-outline',
};

export interface AccountIconProps {
  bankCode?: string | null;
  accountType?: string | null;
  /** Yalnızca accountType === 'cash' olduğunda kullanılır. */
  currencyCode?: string | null;
  fallbackName?: string | null;
  size?: number;
}

// Hareket listelerinde (RecentTransactionsList/hareketler.tsx) ve hareket detayında hesap
// kimliğini gösteren ortak ikon: Kasa/Cüzdan gibi bankası olmayan hesaplarda Hesaplar
// sayfasındaki (bkz. app/accounts/index.tsx) ile aynı değer birimi rozetini (TL/USD/altın
// vb. — bkz. features/valueUnits/units.ts) kullanır; banka bilgisi olan hesaplarda banka
// logosuna, o da yoksa hesap türünün ikonuna düşer.
export function AccountIcon({ bankCode, accountType, currencyCode, fallbackName, size = 36 }: AccountIconProps) {
  if (accountType === 'cash') {
    return <ValueUnitBadge unitCode={currencyCode ?? 'TRY'} size={size} />;
  }
  return (
    <BankLogo
      bankCode={bankCode}
      fallbackName={fallbackName}
      fallbackIcon={(accountType && TYPE_ICON[accountType]) || 'business-outline'}
      size={size}
    />
  );
}
