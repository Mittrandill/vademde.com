import { memo } from 'react';

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
}

// docs/08-tasarim-sistemi.md §12.3/§12.17 — iki-üç seçenekli münhasır anahtarlar tek bir
// grafit yüzey içinde kayan Saffron seçili segment olarak gösterilir (Apple segmented
// control benzeri); ayrık kapsül grupları (bkz. filtre çipleri) burada kullanılmaz çünkü
// bu bileşen içeriğine göre boyutlanan, sola hizalı ve münhasır (exclusive) bir seçimdir.
function SegmentedControlInner<T extends string>({
  options,
  value,
  onChange,
  size = 'default',
  trackColor = 'surfacePrimary',
  stretch = false,
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

  return (
    <Row
      gap="xxs"
      style={{
        alignSelf: stretch ? 'stretch' : 'flex-start',
        backgroundColor: theme.colors[trackColor],
        borderRadius: 999,
        padding: 4,
        // Yükseklik her ekranda aynı olsun diye dikey padding'e değil sabit token'a bağlı
        // (docs/08-tasarim-sistemi.md §12.7). `size` yalnızca yatay ölçüyü ve tipografiyi
        // değiştirir, satır yüksekliğini değil.
        height: theme.controlHeight.segmented,
        alignItems: 'center',
      }}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => handleSelect(option.key)}
            style={{
              flex: stretch ? 1 : undefined,
              // stretch modunda genişliği flex belirler; yatay padding minimum kalır ki
              // uzun etiketler (ör. "Gecikmiş") dar telefonda kırpılmasın.
              paddingHorizontal: stretch ? theme.spacing.xs : compact ? theme.spacing.sm : theme.spacing.lg,
              height: theme.controlHeight.segmented - 8,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? theme.colors.brandPrimary : 'transparent',
            }}
          >
            <Text
              variant={compact ? 'caption' : 'body'}
              numberOfLines={1}
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

// Aynı props ile gereksiz yeniden render'ı önler (ör. onboarding/filtre ekranlarında
// options modül sabiti ve onChange bir state setter olduğundan referanslar sabittir).
// memo, jenerik imzayı silmesin diye orijinal fonksiyon tipine cast edilir.
export const SegmentedControl = memo(SegmentedControlInner) as typeof SegmentedControlInner;
