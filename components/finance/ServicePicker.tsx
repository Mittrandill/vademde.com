import { SearchablePicker } from '@/components/primitives';
import { SERVICES } from '@/features/services/services';
import { ServiceLogo } from './ServiceLogo';

const SERVICE_ITEMS = SERVICES.map((service) => ({ id: service.code, name: service.name }));

export interface ServicePickerProps {
  /** Satırın sağında küçük etiket (ör. \"Kategori\"); tuval satırlarındaki ikincil metin. */
  label?: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
  title?: string;
}

export function ServicePicker({ selectedId, onSelect, placeholder, title, label }: ServicePickerProps) {
  return (
    <SearchablePicker
      label={label}
      items={SERVICE_ITEMS}
      selectedId={selectedId}
      onSelect={onSelect}
      renderLeading={(item) => <ServiceLogo serviceCode={item.id} size={36} />}
      placeholder={placeholder ?? 'Servis seçin'}
      title={title ?? 'Servis Seç'}
      emptyLabel="Eşleşen servis bulunamadı. Listede yoksa başlığa yazıp servis seçmeden devam edebilirsiniz."
    />
  );
}
