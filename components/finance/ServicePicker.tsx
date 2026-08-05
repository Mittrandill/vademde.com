import { SearchablePicker } from '@/components/primitives';
import { SERVICES } from '@/features/services/services';
import { ServiceLogo } from './ServiceLogo';

const SERVICE_ITEMS = SERVICES.map((service) => ({ id: service.code, name: service.name }));

export interface ServicePickerProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
  title?: string;
}

export function ServicePicker({ selectedId, onSelect, placeholder, title }: ServicePickerProps) {
  return (
    <SearchablePicker
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
