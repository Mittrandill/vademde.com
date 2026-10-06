import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';

// vademde.css .grp / .row / .ic: 14 radius yüzey, satırlar 56 pt, ayırıcı soldan ikon hizasında başlar.
const ICON_BOX = 34;
const INSET_WITH_ICON = ICON_BOX + 12 + 16;

export function Group({
  children,
  inset = INSET_WITH_ICON,
  style,
}: {
  children: ReactNode;
  /** Ayırıcının soldan boşluğu: ikonlu satırlarda 62, ikonsuzda 16 (vademde.css .grp.ni). */
  inset?: number;
  style?: object;
}) {
  const theme = useTheme();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View
      style={[
        {
          borderRadius: theme.radius.group,
          backgroundColor: theme.colors.surfacePrimary,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {items.map((child, i) => (
        <Fragment key={child.key ?? i}>
          {i > 0 ? <View style={{ height: 1, marginLeft: inset, backgroundColor: theme.colors.separator }} /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

// Üst etiketli (.ov) grup: eski GroupedSection çağrılarıyla uyumlu.
export function GroupedSection({ title, children, inset }: { title?: string; children: ReactNode; inset?: number }) {
  const theme = useTheme();
  return (
    <View>
      {title ? (
        <Text variant="label" color="textSecondary" style={{ paddingLeft: theme.spacing.xxs, marginBottom: 10 }}>
          {title}
        </Text>
      ) : null}
      <Group inset={inset}>{children}</Group>
    </View>
  );
}

type IconTone = 'default' | 'brand' | 'brandSoft' | 'violet' | 'success' | 'danger' | 'aqua';

export function GroupedRowIcon({
  name,
  tone = 'default',
  size = ICON_BOX,
}: {
  name: keyof typeof Ionicons.glyphMap;
  tone?: IconTone;
  size?: number;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const palette: Record<IconTone, { bg: string; fg: string }> = {
    default: { bg: colors.fill, fg: colors.textPrimary },
    brand: { bg: colors.brandPrimary, fg: colors.onAction },
    brandSoft: { bg: 'rgba(255,176,0,0.16)', fg: colors.attentionMarker },
    violet: { bg: 'rgba(107,77,255,0.14)', fg: colors.payable },
    success: { bg: 'rgba(82,206,150,0.16)', fg: colors.success },
    danger: { bg: 'rgba(255,98,92,0.14)', fg: colors.danger },
    aqua: { bg: 'rgba(134,221,235,0.22)', fg: theme.scheme === 'dark' ? colors.accentAqua : '#1B7C8C' },
  };
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size > 36 ? 12 : 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette[tone].bg,
      }}
    >
      <Ionicons name={name} size={19} color={palette[tone].fg} />
    </View>
  );
}

export function GroupedRow({
  leading,
  title,
  subtitle,
  value,
  trailing,
  onPress,
  disabled,
  chevron = true,
  titleColor,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  /** Sağ tarafa serbest içerik (tutar + etiket gibi); `value`'nun yerine geçer. */
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  chevron?: boolean;
  titleColor?: string;
}) {
  const theme = useTheme();
  const content = (
    <View
      style={{
        minHeight: 56,
        paddingVertical: 10,
        paddingHorizontal: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontWeight: '500', color: titleColor ?? theme.colors.textPrimary }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (value ? (
        <Text color="textSecondary" numberOfLines={1} style={{ flexShrink: 1, maxWidth: '42%', fontSize: 15 }}>
          {value}
        </Text>
      ) : null)}
      {onPress && chevron ? <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}>
      {content}
    </Pressable>
  );
}

export function GroupedToggleRow({
  leading,
  title,
  subtitle,
  value,
  disabled,
  onValueChange,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        minHeight: 56,
        paddingVertical: 10,
        paddingHorizontal: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text>{title}</Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.fill, true: theme.colors.success }}
      />
    </View>
  );
}

export function GroupedRowAvatar({ initials }: { initials: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: ICON_BOX,
        height: ICON_BOX,
        borderRadius: ICON_BOX / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.fill,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '600' }}>{initials}</Text>
    </View>
  );
}
