import { TextInput, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

export function TextField({ style, placeholderTextColor, ...rest }: TextInputProps) {
  const theme = useTheme();

  return (
    <TextInput
      placeholderTextColor={placeholderTextColor ?? theme.colors.textSecondary}
      style={[
        theme.typography.body,
        {
          color: theme.colors.textPrimary,
          backgroundColor: theme.colors.surfacePrimary,
          borderRadius: theme.radius.input,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: theme.spacing.md,
          height: theme.buttonHeight.primary,
        },
        style,
      ]}
      {...rest}
    />
  );
}
