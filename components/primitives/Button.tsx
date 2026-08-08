import { memo } from 'react';
import { ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Row } from './Stack';
import { Text } from './Text';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  /** Etiketin solunda küçük bir ikon — verilmezse düz metin buton olarak kalır. */
  icon?: keyof typeof Ionicons.glyphMap;
}

// docs/08-tasarim-sistemi.md §12.16 — birincil buton Saffron, koyu metin, 54-56 pt;
// yükleme sırasında buton boyutu değişmez.
function ButtonComponent({ label, onPress, variant = 'primary', loading, disabled, icon }: ButtonProps) {
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
        opacity: disabled ? theme.opacity.disabled : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : icon ? (
        <Row gap="xs" align="center">
          <Ionicons name={icon} size={20} color={textColor} />
          <Text variant="cardTitle" style={{ color: textColor }}>
            {label}
          </Text>
        </Row>
      ) : (
        <Text variant="cardTitle" style={{ color: textColor }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export const Button = memo(ButtonComponent);
