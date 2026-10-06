import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';

// vademde.css .pill: 34 pt kapsül, 15 pt/500; seçili hâl metin renginde dolgu.
export function Pill({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  const fg = selected ? theme.colors.backgroundPrimary : theme.colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={{
        height: 34,
        paddingHorizontal: 14,
        borderRadius: 17,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: selected ? theme.colors.textPrimary : theme.colors.fill,
      }}
    >
      {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '500', color: fg }}>
        {label}
      </Text>
    </Pressable>
  );
}
