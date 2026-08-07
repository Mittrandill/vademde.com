import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { SearchablePicker } from '@/components/primitives';
import { VALUE_UNITS, VALUE_UNIT_ICON, getValueUnit } from '@/features/valueUnits/units';

const VALUE_UNIT_ITEMS = VALUE_UNITS.map((unit) => ({ id: unit.code, name: unit.name }));

export interface ValueUnitPickerProps {
  selectedId: string | null;
  onSelect: (code: string) => void;
  placeholder?: string;
  title?: string;
}

// BankPicker/ServicePicker ile aynı ince sarmalayıcı desen (bkz. o dosyalardaki yorum);
// tek fark, logo asseti yerine fiat/kıymetli maden ayrımını gösteren bir rozet ikonu.
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

function ValueUnitBadge({ unitCode, size }: { unitCode: string; size: number }) {
  const theme = useTheme();
  const unit = getValueUnit(unitCode);
  const accent = unit.unitType === 'fiat' ? theme.colors.brandPrimary : theme.colors.accentViolet;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: withAlpha(accent, 0.16),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={VALUE_UNIT_ICON[unit.unitType]} size={size * 0.55} color={accent} />
    </View>
  );
}
