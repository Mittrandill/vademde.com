import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { SearchablePicker } from '@/components/primitives';
import { VALUE_UNITS, getValueUnit } from '@/features/valueUnits/units';

const VALUE_UNIT_ITEMS = VALUE_UNITS.map((unit) => ({ id: unit.code, name: unit.name }));

export interface ValueUnitPickerProps {
  selectedId: string | null;
  onSelect: (code: string) => void;
  placeholder?: string;
  title?: string;
}

// BankPicker/ServicePicker ile aynı ince sarmalayıcı desen (bkz. o dosyalardaki yorum);
// tek fark, logo asseti yerine her para birimi/altın türü için gerçek sembol/madalyon
// ikonu taşıyan bir rozet (bkz. features/valueUnits/units.ts'teki icon/color alanları).
export function ValueUnitPicker({ selectedId, onSelect, placeholder, title }: ValueUnitPickerProps) {
  return (
    <SearchablePicker
      items={VALUE_UNIT_ITEMS}
      selectedId={selectedId}
      onSelect={onSelect}
      renderLeading={(item) => <ValueUnitBadge unitCode={item.id} size={36} />}
      placeholder={placeholder ?? 'Değer birimi seçin'}
      title={title ?? 'Değer Birimi Seç'}
      emptyLabel="Eşleşen değer birimi bulunamadı."
    />
  );
}

export function ValueUnitBadge({ unitCode, size }: { unitCode: string; size: number }) {
  const unit = getValueUnit(unitCode);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: unit.color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons name={unit.icon} size={size * 0.55} color="#FFFFFF" />
    </View>
  );
}
