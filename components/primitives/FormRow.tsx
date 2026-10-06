import { Children, createContext, Fragment, useContext, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { MAX_FONT_SCALE, monoFamily } from '@/theme/typography';
import { toSentenceLabel } from '@/utils/labelCase';
import { Pressable } from './Pressable';
import { Text } from './Text';

// vademde.css .grp + .f: form satırları tek bir gruplu yüzeyde (14 radius) ince ayırıcıyla dizilir;
// her satır üstte 13 pt ikincil etiket, altında 17 pt değer taşır.

// Bir FieldGroup içindeki alanlar kendi kutularını çizmez (grup çizer); tek başına kullanıldıklarında
// aynı görünümü kendileri üretir. Context bu ayrımı alanlara taşır.
const FieldGroupContext = createContext(false);
export const useInFieldGroup = () => useContext(FieldGroupContext);

export function FieldGroup({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const items = Children.toArray(children);

  return (
    <FieldGroupContext.Provider value>
      <View
        style={{
          backgroundColor: theme.colors.surfacePrimary,
          borderRadius: theme.radius.group,
          overflow: 'hidden',
        }}
      >
        {items.map((child, index) => (
          <Fragment key={index}>
            {index > 0 ? (
              <View style={{ height: 1, backgroundColor: theme.colors.separator, marginLeft: theme.spacing.md }} />
            ) : null}
            {child}
          </Fragment>
        ))}
      </View>
    </FieldGroupContext.Provider>
  );
}

/** Tek başına duran alan satırı için grup kabı (FieldGroup içindeyse hiçbir şey çizmez). */
export function FieldShell({ children, focused, error }: { children: ReactNode; focused?: boolean; error?: boolean }) {
  const theme = useTheme();
  const grouped = useInFieldGroup();
  const bar = focused ? (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: theme.colors.brandPrimary }}
    />
  ) : null;

  if (grouped) {
    return (
      <View style={{ position: 'relative' }}>
        {children}
        {bar}
      </View>
    );
  }
  return (
    <View
      style={{
        position: 'relative',
        backgroundColor: theme.colors.surfacePrimary,
        borderRadius: theme.radius.group,
        overflow: 'hidden',
        borderWidth: error ? 1 : 0,
        borderColor: theme.colors.danger,
      }}
    >
      {children}
      {bar}
    </View>
  );
}

export function FieldLabel({ children, focused, error }: { children: string; focused?: boolean; error?: boolean }) {
  const theme = useTheme();
  const color = error ? theme.colors.danger : focused ? theme.colors.attentionMarker : theme.colors.textSecondary;
  return (
    <Text
      numberOfLines={1}
      style={{ fontSize: 13, lineHeight: 18, color, fontWeight: focused || error ? '600' : '400' }}
    >
      {toSentenceLabel(children)}
    </Text>
  );
}

export interface FormRowProps {
  label: string;
  /** Satır değeri; verilmezse `children` (ör. SourceTag, özel içerik) gösterilir. */
  value?: string;
  placeholder?: string;
  /** Etiketin sağında küçük etiket (ör. <SourceTag />). */
  tag?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Verilirse satır dokunulabilir olur ve sağda ok gösterilir (seçici açar). */
  onPress?: () => void;
  focused?: boolean;
  error?: boolean;
  children?: ReactNode;
}

export function FormRow({ label, value, placeholder, tag, icon, onPress, focused, error, children }: FormRowProps) {
  const theme = useTheme();

  const body = (
    <View
      style={{
        minHeight: 60,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 11,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
      }}
    >
      {icon ? <Ionicons name={icon} size={theme.iconSize.xl} color={theme.colors.textSecondary} /> : null}
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <FieldLabel focused={focused} error={error}>
            {label}
          </FieldLabel>
          {tag}
        </View>
        {children ?? (
          <Text variant="body" color={value ? 'textPrimary' : 'mutedControl'} numberOfLines={1}>
            {value || placeholder || ''}
          </Text>
        )}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} /> : null}
    </View>
  );

  const content = (
    <FieldShell focused={focused} error={error}>
      {body}
    </FieldShell>
  );
  if (!onPress) return content;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={value ? `${label}: ${value}` : label} onPress={onPress}>
      {content}
    </Pressable>
  );
}

export interface InputRowProps extends Omit<TextInputProps, 'style'> {
  label: string;
  tag?: ReactNode;
  /** IBAN, belge no gibi alanlarda sistem monospace. */
  mono?: boolean;
}

export function InputRow({ label, tag, mono, maxFontSizeMultiplier = MAX_FONT_SCALE, ...rest }: InputRowProps) {
  const theme = useTheme();

  return (
    <FormRow label={label} tag={tag}>
      <TextInput
        placeholderTextColor={theme.colors.mutedControl}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        accessibilityLabel={label}
        style={[
          theme.typography.body,
          {
            fontFamily: mono ? monoFamily : undefined,
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
