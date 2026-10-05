import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Divider } from './Divider';
import { Pressable } from './Pressable';
import { Row, Stack } from './Stack';
import { Text } from './Text';

const ROW_ICON_SIZE = 32;
// Satırlar arası hairline, ikon + boşluk + sol padding hizasından başlar.
const DIVIDER_INSET = ROW_ICON_SIZE + 12 + 16;

// Tasarımdaki gruplu liste: mono başlık + tek yüzey üzerinde hairline ayraçlı satırlar.
export function GroupedSection({ title, children }: { title?: string; children: ReactNode }) {
  const theme = useTheme();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <Stack gap="xs">
      {title ? (
        <Text variant="label" color="textSecondary" style={{ paddingLeft: theme.spacing.xxs }}>
          {title}
        </Text>
      ) : null}
      <View style={{ borderRadius: theme.radius.widget, backgroundColor: theme.colors.surfacePrimary, overflow: 'hidden' }}>
        {items.map((child, i) => (
          <Fragment key={child.key ?? i}>
            {i > 0 ? <Divider style={{ marginLeft: DIVIDER_INSET }} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
    </Stack>
  );
}

export function GroupedRowIcon({ name }: { name: keyof typeof Ionicons.glyphMap }) {
  const theme = useTheme();
  return (
    <View style={{ width: ROW_ICON_SIZE, height: ROW_ICON_SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={22} color={theme.colors.textPrimary} />
    </View>
  );
}

export function GroupedRow({
  leading,
  title,
  subtitle,
  value,
  onPress,
  disabled,
  chevron = true,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  disabled?: boolean;
  chevron?: boolean;
}) {
  const theme = useTheme();
  const content = (
    <Row gap="sm" align="center" style={{ minHeight: 56, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.md }}>
      {leading}
      <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
        <Text variant="cardTitle" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </Stack>
      {value ? (
        <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1, maxWidth: '40%' }}>
          {value}
        </Text>
      ) : null}
      {onPress && chevron ? <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedControl} /> : null}
    </Row>
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
    <Row gap="sm" align="center" style={{ minHeight: 56, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.md }}>
      {leading}
      <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
        <Text variant="cardTitle">{title}</Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </Stack>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.action }}
      />
    </Row>
  );
}

export function GroupedRowAvatar({ initials }: { initials: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: ROW_ICON_SIZE,
        height: ROW_ICON_SIZE,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.backgroundPrimary,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Text variant="label" mono style={{ color: theme.colors.textPrimary, textTransform: 'none' }}>
        {initials}
      </Text>
    </View>
  );
}
