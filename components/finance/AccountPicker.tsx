import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { SearchablePicker } from '@/components/primitives';
import { BankLogo } from './BankLogo';
import { ValueUnitBadge } from './ValueUnitPicker';
import type { Account } from '@/features/accounts/api';
import { t } from '@/i18n';

const TYPE_ICON: Record<Account['type'], keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline',
  bank: 'business-outline',
  wallet: 'wallet-outline',
  credit_card: 'card-outline',
  pos: 'storefront-outline',
};

// Hesabın simgesi: nakitte değer birimi rozeti, diğerlerinde banka logosu ya da tür ikonu.
export function AccountAvatar({ account, size = 36 }: { account: Account; size?: number }) {
  return account.type === 'cash' ? (
    <ValueUnitBadge unitCode={account.currency_code} size={size} />
  ) : (
    <BankLogo bankCode={account.bank_code} fallbackIcon={TYPE_ICON[account.type as Account['type']]} size={size} />
  );
}

export interface AccountPickerProps {
  /** Satırın sağında küçük etiket (ör. \"Kategori\"); tuval satırlarındaki ikincil metin. */
  label?: string;
  accounts: Account[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
  title?: string;
  renderTrigger?: (selected: Account | null, open: () => void) => ReactNode;
}

export function AccountPicker({ accounts, selectedId, onSelect, placeholder, title, label, renderTrigger }: AccountPickerProps) {
  return (
    <SearchablePicker
      label={label}
      renderTrigger={renderTrigger}
      items={accounts}
      selectedId={selectedId}
      onSelect={onSelect}
      renderLeading={(item) => <AccountAvatar account={item} />}
      placeholder={placeholder ?? t('ui.pickers.account.placeholder')}
      title={title ?? t('ui.pickers.account.title')}
      emptyLabel={t('ui.pickers.account.empty')}
    />
  );
}
