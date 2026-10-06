import { TextInput, View } from 'react-native';

import { useTheme } from '@/theme';
import { MAX_FONT_SCALE } from '@/theme/typography';
import { formatAmountInput } from '@/utils/money';
import { Text } from './Text';

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

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' }}>
        {symbol ? (
          <Text
            style={{ fontSize, lineHeight: fontSize * 1.1, fontWeight: '600', letterSpacing: -fontSize * 0.03, color: theme.colors.textSecondary }}
          >
            {symbol}
          </Text>
        ) : null}
        <TextInput
          accessibilityLabel="Tutar"
          value={value}
          onChangeText={(text) => onChangeText(formatAmountInput(text, precision))}
          placeholder={precision === 0 ? '0' : '0,00'}
          placeholderTextColor={theme.colors.mutedControl}
          keyboardType={precision === 0 ? 'number-pad' : 'decimal-pad'}
          autoFocus={autoFocus}
          selectionColor={theme.colors.brandPrimary}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{
            minWidth: 60,
            padding: 0,
            fontSize,
            lineHeight: fontSize * 1.1,
            fontWeight: '700',
            letterSpacing: -fontSize * 0.03,
            fontVariant: ['tabular-nums'],
            color: theme.colors.textPrimary,
          }}
        />
      </View>
      {caption ? (
        <Text variant="caption" color="textSecondary">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
