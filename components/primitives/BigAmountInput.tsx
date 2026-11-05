import { StyleSheet, Text as NativeText, TextInput, View } from 'react-native';

import { useTheme } from '@/theme';
import { MAX_FONT_SCALE } from '@/theme/typography';
import { formatAmountInput } from '@/utils/money';
import { Text } from './Text';
import { t } from '@/i18n';
import { amountPlaceholder } from '@/i18n/format';

export interface BigAmountInputProps {
  value: string;
  onChangeText: (value: string) => void;
  /** Para birimi simgesi (₺, $, € …); verilmezse çizilmez. */
  symbol?: string;
  precision?: 0 | 2;
  autoFocus?: boolean;
  /** Alanın altındaki küçük açıklama (ör. "Taslak otomatik kaydediliyor"). */
  caption?: string;
}

// Tuval YeniHareket / OdemeKaydet / Transfer: ortalanmış 52 pt tutar girişi, soluk para simgesi ve Saffron imleç.
export function BigAmountInput({ value, onChangeText, symbol, precision = 2, autoFocus, caption }: BigAmountInputProps) {
  const theme = useTheme();
  const fontSize = value.length > 9 ? 40 : value.length > 7 ? 46 : 52;
  const inputStyle = {
    fontSize,
    lineHeight: fontSize * 1.1,
    fontWeight: '700' as const,
    letterSpacing: -fontSize * 0.03,
    fontVariant: ['tabular-nums'] as 'tabular-nums'[],
    color: theme.colors.textPrimary,
    paddingVertical: 0,
    paddingHorizontal: 8,
  };

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', maxWidth: '100%' }}>
        {symbol ? (
          <Text
            style={{ fontSize, lineHeight: fontSize * 1.1, fontWeight: '600', letterSpacing: -fontSize * 0.03, color: theme.colors.textSecondary }}
          >
            {symbol}
          </Text>
        ) : null}
        <View style={{ minWidth: 80, flexShrink: 1 }}>
          {/* Native Text determines the full text width even while the input is blurred.
              Padding protects the final glyph from TextInput's horizontal clipping. */}
          <NativeText accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[inputStyle, { opacity: 0 }]}>
            {value || (precision === 0 ? '0' : amountPlaceholder())}
          </NativeText>
          <TextInput
            accessibilityLabel={t('ui.amount')}
            value={value}
            onChangeText={(text) => onChangeText(formatAmountInput(text, precision))}
            placeholder={precision === 0 ? '0' : amountPlaceholder()}
            placeholderTextColor={theme.colors.mutedControl}
            keyboardType={precision === 0 ? 'number-pad' : 'decimal-pad'}
            autoFocus={autoFocus}
            selectionColor={theme.colors.brandPrimary}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[StyleSheet.absoluteFill, inputStyle, { width: '100%' }]}
          />
        </View>
      </View>
      {caption ? (
        <Text variant="caption" color="textSecondary">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
