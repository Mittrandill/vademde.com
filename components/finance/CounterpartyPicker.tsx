import { SearchablePicker } from '@/components/primitives';
import { createCounterparty, type Counterparty } from '@/features/counterparties/api';
import { PersonAvatar } from './PersonAvatar';

export interface CounterpartyPickerProps {
  counterparties: Counterparty[];
  workspaceId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated?: (counterparty: Counterparty) => void;
}

export function CounterpartyPicker({
  counterparties,
  workspaceId,
  selectedId,
  onSelect,
  onCreated,
}: CounterpartyPickerProps) {
  return (
    <SearchablePicker
      items={counterparties}
      selectedId={selectedId}
      onSelect={onSelect}
      renderLeading={(item) => <PersonAvatar name={item.name} size={36} />}
      placeholder="Kişi / firma seçin"
      title="Kişi / Firma Seç"
      emptyLabel="Eşleşen kişi/firma bulunamadı."
      onCreateNew={async (name) => {
        const created = await createCounterparty({ workspace_id: workspaceId, name, type: 'individual' });
        onSelect(created.id);
        onCreated?.(created);
      }}
    />
  );
}
