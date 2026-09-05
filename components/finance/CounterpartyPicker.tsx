import { SearchablePicker } from '@/components/primitives';
import { createCounterparty, type Counterparty, type CounterpartyType } from '@/features/counterparties/api';
import { PersonAvatar } from './PersonAvatar';

export interface CounterpartyPickerProps {
  counterparties: Counterparty[];
  workspaceId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated?: (counterparty: Counterparty) => void;
  /** Listede olmayan bir isim yazılıp anında oluşturulduğunda atanacak cari türü.
   * Maaş kaydı gibi bağlamlarda 'personel' verilir; aksi halde 'individual'. */
  defaultType?: CounterpartyType;
  placeholder?: string;
}

export function CounterpartyPicker({
  counterparties,
  workspaceId,
  selectedId,
  onSelect,
  onCreated,
  defaultType = 'individual',
  placeholder = 'Kişi / firma seçin',
}: CounterpartyPickerProps) {
  return (
    <SearchablePicker
      items={counterparties}
      selectedId={selectedId}
      onSelect={onSelect}
      renderLeading={(item) => <PersonAvatar name={item.name} size={36} />}
      placeholder={placeholder}
      title="Cari Seç"
      emptyLabel="Eşleşen cari bulunamadı."
      onCreateNew={async (name) => {
        const created = await createCounterparty({ workspace_id: workspaceId, name, type: defaultType });
        onSelect(created.id);
        onCreated?.(created);
      }}
    />
  );
}
