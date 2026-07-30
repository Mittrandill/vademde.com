import { SearchablePicker } from '@/components/primitives';
import { DOCUMENT_TYPES } from '@/features/obligations/documentTypes';

export interface DocumentTypePickerProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function DocumentTypePicker({ selectedId, onSelect }: DocumentTypePickerProps) {
  return (
    <SearchablePicker
      items={DOCUMENT_TYPES}
      selectedId={selectedId}
      onSelect={onSelect}
      getIcon={(item) => item.icon}
      placeholder="Belge türü seçin"
      title="Belge Türü Seç"
      emptyLabel="Eşleşen belge türü bulunamadı."
    />
  );
}
