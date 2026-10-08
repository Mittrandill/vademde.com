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
  /** primary = Saffron aksiyon; secondary = hafif dolgu; danger = dolgulu kırmızı; dangerText = kırmızı metin;
   * text = çerçevesiz metin; ink = metin renginde dolgu (Apple ile giriş); dangerSoft = hafif dolgu + kırmızı metin. */
  variant?: 'primary' | 'secondary' | 'danger' | 'dangerText' | 'dangerSoft' | 'text' | 'ink';
  /** default 52 pt; compact 44 pt; sm 36 pt kapsül (vademde.css .btn.sm). */
  size?: 'default' | 'compact' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  /** Etiketin solunda küçük bir ikon — verilmezse düz metin buton olarak kalır. */
  icon?: keyof typeof Ionicons.glyphMap;
}

// vademde.css .btn: 52 pt, 14 radius, 17 pt/600. Devre dışı: hafif dolgu + soluk metin (opaklık değil).
function ButtonComponent({ label, onPress, variant = 'primary', size = 'default', loading, disabled, icon }: ButtonProps) {
  const theme = useTheme();
  const { colors } = theme;

  let background: string = colors.brandPrimary;
  let textColor: string = colors.onAction;
  if (variant === 'secondary') {
    background = colors.fill;
    textColor = colors.textPrimary;
  } else if (variant === 'danger') {
    background = colors.danger;
    textColor = '#FFFFFF';
  } else if (variant === 'dangerSoft') {
    background = colors.fill;
    textColor = colors.danger;
  } else if (variant === 'dangerText') {
    background = 'transparent';
    textColor = colors.danger;
  } else if (variant === 'text') {
    background = 'transparent';
    textColor = colors.textPrimary;
  } else if (variant === 'ink') {
    background = colors.textPrimary;
    textColor = colors.backgroundPrimary;
  }
  if (disabled && variant !== 'text' && variant !== 'dangerText') {
    background = colors.fill;
    textColor = colors.mutedControl;
  }

  const height = size === 'sm' ? 36 : size === 'compact' || variant === 'text' || variant === 'dangerText' ? 44 : theme.buttonHeight.primary;
  const fontSize = size === 'sm' ? 15 : 17;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={{
        height,
        paddingHorizontal: size === 'sm' ? 14 : theme.spacing.lg,
        borderRadius: size === 'sm' ? 18 : theme.radius.button,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: size === 'sm' ? 'flex-start' : undefined,
        opacity: disabled && (variant === 'text' || variant === 'dangerText') ? theme.opacity.disabled : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Row gap="xs" align="center">
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={textColor} /> : null}
          <Text variant="cardTitle" style={{ color: textColor, fontSize, fontWeight: '600' }}>
            {label}
          </Text>
        </Row>
      )}
    </Pressable>
  );
}

export const Button = memo(ButtonComponent);
