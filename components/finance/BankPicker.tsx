import { SearchablePicker } from '@/components/primitives';
import { BANKS } from '@/features/banks/banks';
import { BankLogo } from './BankLogo';

const BANK_ITEMS = BANKS.map((bank) => ({ id: bank.code, name: bank.name }));

export interface BankPickerProps {
  /** Satırın sağında küçük etiket (ör. \"Kategori\"); tuval satırlarındaki ikincil metin. */
  label?: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
  title?: string;
}

export function BankPicker({ selectedId, onSelect, placeholder, title, label }: BankPickerProps) {
  return (
    <SearchablePicker
      label={label}
      items={BANK_ITEMS}
      selectedId={selectedId}
      onSelect={onSelect}
      renderLeading={(item) => <BankLogo bankCode={item.id} size={36} />}
      placeholder={placeholder ?? 'Banka seçin'}
      title={title ?? 'Banka Seç'}
      emptyLabel="Eşleşen banka bulunamadı."
    />
  );
}
