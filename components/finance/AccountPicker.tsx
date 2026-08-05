import { Ionicons } from '@expo/vector-icons';

import { SearchablePicker } from '@/components/primitives';
import { BankLogo } from './BankLogo';
import type { Account } from '@/features/accounts/api';

const TYPE_ICON: Record<Account['type'], keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline',
  bank: 'business-outline',
  wallet: 'wallet-outline',
  credit_card: 'card-outline',
};

export interface AccountPickerProps {
  accounts: Account[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
  title?: string;
}

export function AccountPicker({ accounts, selectedId, onSelect, placeholder, title }: AccountPickerProps) {
  return (
    <SearchablePicker
      items={accounts}
      selectedId={selectedId}
      onSelect={onSelect}
      renderLeading={(item) => (
        <BankLogo bankCode={item.bank_code} fallbackIcon={TYPE_ICON[item.type as Account['type']]} size={36} />
      )}
      placeholder={placeholder ?? 'Hesap seçin'}
      title={title ?? 'Hesap Seç'}
      emptyLabel="Eşleşen hesap bulunamadı."
    />
  );
}
