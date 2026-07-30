import { Ionicons } from '@expo/vector-icons';

import { SearchablePicker } from '@/components/primitives';
import type { Category } from '@/features/categories/api';

const FALLBACK_ICON: keyof typeof Ionicons.glyphMap = 'pricetag-outline';

export interface CategoryPickerProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
}

export function CategoryPicker({ categories, selectedId, onSelect, placeholder }: CategoryPickerProps) {
  return (
    <SearchablePicker
      items={categories}
      selectedId={selectedId}
      onSelect={onSelect}
      getIcon={(item) => (item.icon as keyof typeof Ionicons.glyphMap) || FALLBACK_ICON}
      placeholder={placeholder ?? 'Kategori seçin'}
      title="Kategori Seç"
      emptyLabel="Eşleşen kategori bulunamadı."
    />
  );
}
