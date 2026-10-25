import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { SearchablePicker } from '@/components/primitives';
import { VALUE_UNITS, getValueUnit } from '@/features/valueUnits/units';
import { t } from '@/i18n';

// `name` okunduğu anda çözülür (dil değişince seçici yeni dilde listelenir).
const VALUE_UNIT_ITEMS = VALUE_UNITS.map((unit) => ({
  id: unit.code,
  get name() {
    return unit.name;
  },
}));

export interface ValueUnitPickerProps {
  /** Satırın sağında küçük etiket (ör. \"Kategori\"); tuval satırlarındaki ikincil metin. */
  label?: string;
  selectedId: string | null;
  onSelect: (code: string) => void;
  placeholder?: string;
  title?: string;
}

// BankPicker/ServicePicker ile aynı ince sarmalayıcı desen (bkz. o dosyalardaki yorum);
// tek fark, logo asseti yerine her para birimi/altın türü için gerçek sembol/madalyon
// ikonu taşıyan bir rozet (bkz. features/valueUnits/units.ts'teki icon/color alanları).
export function ValueUnitPicker({ selectedId, onSelect, placeholder, title, label }: ValueUnitPickerProps) {
  return (
    <SearchablePicker
      label={label}
      items={VALUE_UNIT_ITEMS}
      selectedId={selectedId}
      onSelect={onSelect}
      renderLeading={(item) => <ValueUnitBadge unitCode={item.id} size={36} />}
      placeholder={placeholder ?? t('ui.pickers.valueUnit.placeholder')}
      title={title ?? t('ui.pickers.valueUnit.title')}
      emptyLabel={t('ui.pickers.valueUnit.empty')}
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
