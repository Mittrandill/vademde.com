import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { MAX_FONT_SCALE } from '@/theme/typography';
import { FieldLabel, FieldShell } from './FormRow';
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
  const hasError = !!error || !!invalid;

  // vademde.css .f: etiket üstte (13 pt, ikincil), değer altta (17 pt); odakta soldan 3 pt Saffron çizgi.
  const field = (
    <FieldShell focused={focused} error={hasError}>
      <View
        style={{
          paddingHorizontal: theme.spacing.md,
          paddingVertical: label ? 11 : 0,
          minHeight: label ? 60 : theme.buttonHeight.primary,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}
      >
        <View style={{ flex: 1, gap: 2, justifyContent: 'center', minWidth: 0 }}>
          {label ? (
            <FieldLabel focused={focused} error={hasError}>
              {label}
            </FieldLabel>
          ) : null}
          <TextInput
            placeholderTextColor={placeholderTextColor ?? theme.colors.mutedControl}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
            accessibilityLabel={label ?? rest.accessibilityLabel}
            selectionColor={theme.colors.brandPrimary}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            style={[
              theme.typography.body,
              {
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
    </FieldShell>
  );

  const wrapped = <View style={layout as object}>{field}</View>;
  if (!error) return wrapped;

  return (
    <Stack gap="xxs" style={layout}>
      {field}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: theme.spacing.md }}>
        <Ionicons name="alert-circle" size={14} color={theme.colors.danger} />
        <Text variant="caption" color="danger" style={{ flex: 1 }}>
          {error}
        </Text>
      </View>
    </Stack>
  );
}
