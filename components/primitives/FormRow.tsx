import { Children, Fragment, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { MAX_FONT_SCALE, fontFamily } from '@/theme/typography';
import { Pressable } from './Pressable';
import { Text } from './Text';

// HANDOFF §3 — FormRow / InputRow / FieldGroup: etiket üstte (mono), değer altta;
// satırlar tek bir yüzey grubunda ince çizgiyle ayrılır.

export function FieldGroup({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const items = Children.toArray(children);

  return (
    <View
      style={{
        backgroundColor: theme.colors.surfacePrimary,
        borderRadius: theme.radius.widget,
        overflow: 'hidden',
      }}
    >
      {items.map((child, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <View
              style={{
                height: 1,
                backgroundColor: theme.colors.border,
                marginLeft: theme.spacing.md,
              }}
            />
          ) : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

export interface FormRowProps {
  label: string;
  /** Satır değeri; verilmezse `children` (ör. SourceTag, özel içerik) gösterilir. */
  value?: string;
  placeholder?: string;
  /** Sağ üst köşede küçük etiket (ör. <SourceTag />). */
  tag?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Verilirse satır dokunulabilir olur ve sağda ok gösterilir (seçici açar). */
  onPress?: () => void;
  children?: ReactNode;
}

export function FormRow({ label, value, placeholder, tag, icon, onPress, children }: FormRowProps) {
  const theme = useTheme();

  const body = (
    <View
      style={{
        minHeight: theme.touchTarget.minimum + theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
      }}
    >
      {icon ? <Ionicons name={icon} size={theme.iconSize.xl} color={theme.colors.textSecondary} /> : null}
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <Text variant="label" color="textSecondary" numberOfLines={1}>
          {label}
        </Text>
        {children ?? (
          <Text
            variant="cardTitle"
            color={value ? 'textPrimary' : 'textSecondary'}
            numberOfLines={1}
          >
            {value || placeholder || ''}
          </Text>
        )}
      </View>
      {tag}
      {onPress ? (
        <Ionicons name="chevron-forward" size={theme.iconSize.md} color={theme.colors.mutedControl} />
      ) : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}

export interface InputRowProps extends Omit<TextInputProps, 'style'> {
  label: string;
  tag?: ReactNode;
  /** Tutar, IBAN gibi alanlarda Plex Mono. */
  mono?: boolean;
}

export function InputRow({
  label,
  tag,
  mono,
  maxFontSizeMultiplier = MAX_FONT_SCALE,
  ...rest
}: InputRowProps) {
  const theme = useTheme();

  return (
    <FormRow label={label} tag={tag}>
      <TextInput
        placeholderTextColor={theme.colors.mutedControl}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        accessibilityLabel={label}
        style={[
          theme.typography.cardTitle,
          {
            fontFamily: mono ? fontFamily.mono.medium : fontFamily.sans.semibold,
            color: theme.colors.textPrimary,
            padding: 0,
            minHeight: 24,
          },
          mono ? theme.tabularNums : null,
        ]}
        {...rest}
      />
    </FormRow>
  );
}
