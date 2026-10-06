import { memo } from 'react';
import { ScrollView, View } from 'react-native';

import { useTheme } from '@/theme';
import type { ThemeColors } from '@/theme/colors';
import { Pressable } from './Pressable';
import { Text } from './Text';

export interface SegmentedControlOption<T extends string> {
  key: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'default' | 'compact';
  /** Geriye dönük uyumluluk: iOS segmenti her zaman hafif dolgu zemin kullanır. */
  trackColor?: keyof ThemeColors;
  /** Geriye dönük uyumluluk: segmentler varsayılan olarak satırı eşit böler. */
  stretch?: boolean;
  /** Uzun filtre satırlarında seçenekleri küçültmeden sabit genişlikle yatay kaydırır. */
  scrollable?: boolean;
}

// vademde.css .seg: hafif dolgu zemin, 10 radius, 2 pt boşluk; seçili seçenek yükseltilmiş yüzey
// (8 radius, ince gölge), 14 pt/500 (seçili 600), 32 pt yükseklik.
function SegmentedControlInner<T extends string>({
  options,
  value,
  onChange,
  scrollable = false,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const selectedBackground = theme.scheme === 'dark' ? '#5A5C62' : theme.colors.surfaceElevated;

  const control = (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.fill,
        borderRadius: theme.radius.control,
        padding: 2,
        gap: 2,
        alignSelf: scrollable ? 'flex-start' : 'stretch',
      }}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => {
              if (!selected) onChange(option.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label} seçeneği`}
            style={{
              flex: scrollable ? undefined : 1,
              minWidth: scrollable ? 92 : 0,
              paddingHorizontal: scrollable ? theme.spacing.md : 2,
              height: 32,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? selectedBackground : 'transparent',
              shadowColor: '#000',
              shadowOpacity: selected ? 0.12 : 0,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit={!scrollable}
              minimumFontScale={0.8}
              style={{ fontSize: 14, fontWeight: selected ? '600' : '500', textAlign: 'center' }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (!scrollable) return control;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      alwaysBounceHorizontal={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingRight: theme.spacing.md }}
    >
      {control}
    </ScrollView>
  );
}

export const SegmentedControl = memo(SegmentedControlInner) as typeof SegmentedControlInner;
