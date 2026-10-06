import { SearchablePicker } from '@/components/primitives';
import { CategoryIcon } from './CategoryIcon';
import type { Category } from '@/features/categories/api';

export interface CategoryPickerProps {
  /** Satırın sağında küçük etiket (ör. \"Kategori\"); tuval satırlarındaki ikincil metin. */
  label?: string;
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
}

export function CategoryPicker({ categories, selectedId, onSelect, placeholder, label }: CategoryPickerProps) {
  return (
    <SearchablePicker
      label={label}
      items={categories}
      selectedId={selectedId}
      onSelect={onSelect}
      renderLeading={(item) => <CategoryIcon icon={item.icon} color={item.color} size={36} />}
      placeholder={placeholder ?? 'Kategori seçin'}
      title="Kategori Seç"
      emptyLabel="Eşleşen kategori bulunamadı."
    />
  );
}
