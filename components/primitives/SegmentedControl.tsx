import { LayoutAnimation, Platform, UIManager } from 'react-native';

import { useTheme } from '@/theme';
import type { ThemeColors } from '@/theme/colors';
import { Pressable } from './Pressable';
import { Row } from './Stack';
import { Text } from './Text';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface SegmentedControlOption<T extends string> {
  key: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'default' | 'compact';
  trackColor?: keyof ThemeColors;
}

// docs/08-tasarim-sistemi.md §12.3/§12.17 — iki-üç seçenekli münhasır anahtarlar tek bir
// grafit yüzey içinde kayan Saffron seçili segment olarak gösterilir (Apple segmented
// control benzeri); ayrık kapsül grupları (bkz. filtre çipleri) burada kullanılmaz çünkü
// bu bileşen içeriğine göre boyutlanan, sola hizalı ve münhasır (exclusive) bir seçimdir.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'default',
  trackColor = 'surfacePrimary',
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const compact = size === 'compact';

  function handleSelect(key: T) {
    if (key === value) return;
    LayoutAnimation.configureNext(LayoutAnimation.create(theme.motion.stateChangeMs, 'easeInEaseOut', 'opacity'));
    onChange(key);
  }

  return (
    <Row
      gap="xxs"
      style={{
        alignSelf: 'flex-start',
        backgroundColor: theme.colors[trackColor],
        borderRadius: 999,
        padding: 4,
      }}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => handleSelect(option.key)}
            style={{
              paddingHorizontal: compact ? theme.spacing.sm : theme.spacing.lg,
              paddingVertical: compact ? 4 : theme.spacing.xs,
              borderRadius: 999,
              alignItems: 'center',
              backgroundColor: selected ? theme.colors.brandPrimary : 'transparent',
            }}
          >
            <Text
              variant={compact ? 'caption' : 'body'}
              style={{
                color: selected ? theme.colors.brandPrimaryText : theme.colors.textSecondary,
                fontWeight: selected ? '600' : '400',
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </Row>
  );
}
