import { ActivityIndicator } from 'react-native';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}

// docs/08-tasarim-sistemi.md §12.16 — birincil buton Saffron, koyu metin, 54-56 pt;
// yükleme sırasında buton boyutu değişmez.
export function Button({ label, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const theme = useTheme();

  const background =
    variant === 'primary'
      ? theme.colors.brandPrimary
      : variant === 'danger'
        ? theme.colors.danger
        : theme.colors.surfaceElevated;

  const textColor = variant === 'secondary' ? theme.colors.textPrimary : theme.colors.brandPrimaryText;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={{
        height: theme.buttonHeight.primary,
        borderRadius: theme.radius.input,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text variant="cardTitle" style={{ color: textColor }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
