import { SearchablePicker } from '@/components/primitives';
import { DOCUMENT_TYPES } from '@/features/obligations/documentTypes';
import { CategoryIcon } from './CategoryIcon';

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
      // CategoryPicker ile aynı kimlik dili: kategoriler nasıl kendi renginde yuvarlak
      // köşeli bir rozetle gösteriliyorsa, belge türleri de tek renkli düz ikon yerine
      // kendi rengiyle (bkz. documentTypes.ts DOCUMENT_TYPES.color) aynı rozeti kullanır.
      renderLeading={(item) => <CategoryIcon icon={item.icon} color={item.color} size={36} />}
      placeholder="Belge türü seçin"
      title="Belge Türü Seç"
      emptyLabel="Eşleşen belge türü bulunamadı."
    />
  );
}
