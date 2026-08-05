import { useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';
import { Stack } from './Stack';
import { Text } from './Text';

export interface TextFieldProps extends TextInputProps {
  /** Input üstünde küçük caption etiketi (docs §12.16 — label inputun üzerinde yer alır). */
  label?: string;
  /** Verilirse input kırmızı border alır ve altında kısa hata mesajı gösterilir. */
  error?: string;
}

export function TextField({
  style,
  placeholderTextColor,
  label,
  error,
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

  const field = (
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
          height: theme.buttonHeight.primary,
        },
        style,
      ]}
      {...rest}
    />
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
