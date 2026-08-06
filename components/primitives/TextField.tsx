import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Stack } from './Stack';
import { Text } from './Text';

export interface TextFieldProps extends TextInputProps {
  /** Input üstünde küçük caption etiketi (docs §12.16 — label inputun üzerinde yer alır). */
  label?: string;
  /** Verilirse input kırmızı border alır ve altında kısa hata mesajı gösterilir. */
  error?: string;
  /** Şifre göster/gizle gibi tek bir sağ ikon aksiyonu (bkz. sign-in ekranı). */
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
}

export function TextField({
  style,
  placeholderTextColor,
  label,
  error,
  rightIcon,
  onRightIconPress,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.brandPrimary
      : theme.colors.border;

  const input = (
    <TextInput
      placeholderTextColor={placeholderTextColor ?? theme.colors.textSecondary}
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
          backgroundColor: theme.colors.surfacePrimary,
          borderRadius: theme.radius.input,
          borderWidth: 1,
          borderColor,
          paddingHorizontal: theme.spacing.md,
          paddingRight: rightIcon ? theme.spacing.xxl + theme.spacing.md : theme.spacing.md,
          height: theme.buttonHeight.primary,
        },
        style,
      ]}
      {...rest}
    />
  );

  const field = rightIcon ? (
    <View>
      {input}
      <Pressable
        onPress={onRightIconPress}
        hitSlop={8}
        style={{
          position: 'absolute',
          right: theme.spacing.sm,
          top: 0,
          bottom: 0,
          justifyContent: 'center',
        }}
      >
        <Ionicons name={rightIcon} size={theme.iconSize.lg} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  ) : (
    input
  );

  if (!label && !error) return field;

  return (
    <Stack gap="xxs">
      {label ? (
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
      ) : null}
      {field}
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}
