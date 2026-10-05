import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { MAX_FONT_SCALE, fontFamily } from '@/theme/typography';
import { Pressable } from './Pressable';
import { Stack } from './Stack';
import { Text } from './Text';

export interface TextFieldProps extends TextInputProps {
  /** Alanın içinde, değerin üstünde küçük mono etiket (HANDOFF §3 FormRow: etiket üstte, değer altta). */
  label?: string;
  /** Verilirse alan kırmızı çerçeve alır ve altında kısa hata mesajı gösterilir. */
  error?: string;
  /** Mesajsız kırmızı çerçeve: birden fazla alanın ortak tek bir hata satırını paylaştığı
   * yan yana düzenlerde (ör. iki günlük alan) hizanın kaymaması için. */
  invalid?: boolean;
  /** Şifre göster/gizle gibi tek bir sağ ikon aksiyonu (bkz. sign-in ekranı). */
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
}

// Yerleşim stilleri (flex, genişlik, kenar boşluğu) dış kaba, geri kalanı (metin stili) girdiye uygulanır;
// böylece <TextField style={{ flex: 1 }} /> satır içinde eskisi gibi çalışır.
const LAYOUT_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'width', 'minWidth', 'maxWidth', 'alignSelf',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
]);

function splitStyle(style: TextInputProps['style']) {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const layout: Record<string, unknown> = {};
  const text: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    (LAYOUT_KEYS.has(key) ? layout : text)[key] = value;
  }
  return { layout, text };
}

export function TextField({
  style,
  placeholderTextColor,
  label,
  error,
  invalid,
  rightIcon,
  onRightIconPress,
  onFocus,
  onBlur,
  maxFontSizeMultiplier = MAX_FONT_SCALE,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const { layout, text } = splitStyle(style);

  const borderColor =
    error || invalid ? theme.colors.danger : focused ? theme.colors.action : theme.colors.border;

  const field = (
    <View
      style={[
        {
          backgroundColor: theme.colors.surfacePrimary,
          borderRadius: 16,
          borderWidth: 1,
          borderColor,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: label ? theme.spacing.xs + 2 : 0,
          minHeight: label ? 64 : theme.buttonHeight.primary,
          justifyContent: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
        },
        error ? null : layout,
      ]}
    >
      <View style={{ flex: 1, gap: 3, justifyContent: 'center' }}>
        {label ? (
          <Text variant="label" color="textSecondary" numberOfLines={1} style={{ fontSize: 10, lineHeight: 12 }}>
            {label}
          </Text>
        ) : null}
        <TextInput
          placeholderTextColor={placeholderTextColor ?? theme.colors.mutedControl}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          accessibilityLabel={label ?? rest.accessibilityLabel}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            theme.typography.cardTitle,
            {
              fontFamily: fontFamily.sans.semibold,
              color: theme.colors.textPrimary,
              padding: 0,
              // Çok satırlı girişlerde yükseklik içerikten gelir; tek satırda sabit satır yüksekliği.
              minHeight: 24,
            },
            text,
          ]}
          {...rest}
        />
      </View>
      {rightIcon ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRightIconPress}
          hitSlop={8}
          style={{ minWidth: theme.touchTarget.minimum, minHeight: theme.touchTarget.minimum, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name={rightIcon} size={theme.iconSize.lg} color={theme.colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );

  if (!error) return field;

  return (
    <Stack gap="xxs" style={layout}>
      {field}
      <Text variant="caption" color="danger">
        {error}
      </Text>
    </Stack>
  );
}
