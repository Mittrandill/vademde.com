import { memo } from 'react';
import { ScrollView } from 'react-native';

import { useTheme } from '@/theme';
import type { ThemeColors } from '@/theme/colors';
import { Pressable } from './Pressable';
import { Row } from './Stack';
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
  trackColor?: keyof ThemeColors;
  /** Satırın tamamını kaplar ve segmentleri eşit böler (iOS segmented control gibi). */
  stretch?: boolean;
  /** Uzun filtre satırlarında seçenekleri küçültmeden sabit genişlikle yatay kaydırır. */
  scrollable?: boolean;
}

// Kredi detayındaki onaylı sekme deseninin uygulama genelindeki tek kaynağı: grafit dış
// yüzey, input-radius dikdörtgen seçenekler ve Saffron seçili durum. Başlık/açıklama bu
// bileşenin parçası değildir; ekran yalnızca seçenekleri ve seçili değeri sağlar.
function SegmentedControlInner<T extends string>({
  options,
  value,
  onChange,
  size = 'default',
  trackColor = 'surfacePrimary',
  stretch = false,
  scrollable = false,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const compact = size === 'compact';

  function handleSelect(key: T) {
    if (key === value) return;
    // LayoutAnimation.configureNext KULLANILMAZ — bu bileşen liste/query invalidation
    // içeren ekranlarda (hareketler, obligations vb.) da kullanılıyor; global legacy
    // animasyon burada da aynı Fabric segfault sınıfına yol açabilir (bkz. TabBar.tsx).
    onChange(key);
  }

  const control = (
    <Row
      gap="xs"
      style={{
        alignSelf: stretch && !scrollable ? 'stretch' : 'flex-start',
        backgroundColor: theme.colors[trackColor],
        borderRadius: theme.radius.widget,
        padding: theme.spacing.xs,
        height: 60,
        alignItems: 'center',
      }}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => handleSelect(option.key)}
            hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label} seçeneği`}
            style={{
              flex: stretch && !scrollable ? 1 : undefined,
              width: scrollable ? 108 : undefined,
              minWidth: scrollable ? 108 : 0,
              paddingHorizontal:
                stretch && !scrollable ? theme.spacing.xxs : compact ? theme.spacing.sm : theme.spacing.lg,
              height: 44,
              borderRadius: theme.radius.input,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? theme.colors.brandPrimary : 'transparent',
            }}
          >
            <Text
              variant="caption"
              numberOfLines={1}
              adjustsFontSizeToFit={stretch && !scrollable}
              minimumFontScale={0.85}
              style={{
                color: selected ? theme.colors.brandPrimaryText : theme.colors.textSecondary,
                fontWeight: '600',
                textAlign: 'center',
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </Row>
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

// Aynı props ile gereksiz yeniden render'ı önler (ör. onboarding/filtre ekranlarında
// options modül sabiti ve onChange bir state setter olduğundan referanslar sabittir).
// memo, jenerik imzayı silmesin diye orijinal fonksiyon tipine cast edilir.
export const SegmentedControl = memo(SegmentedControlInner) as typeof SegmentedControlInner;
