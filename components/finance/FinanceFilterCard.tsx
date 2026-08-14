import { ScrollView } from 'react-native';

import { useTheme } from '@/theme';
import { Card, Divider, Pressable, Stack, Text } from '@/components/primitives';

export interface FinanceFilterOption<T extends string> {
  key: T;
  label: string;
}

export interface FinanceFilterCardProps<T extends string> {
  title: string;
  description: string;
  options: FinanceFilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

// Kişiler'deki CARİ TÜRÜ kartının ortak karşılığı. Seçenekler dar ekranda küçülmez;
// bütün filtrelerde aynı genişliği korur ve gerekirse yatay kaydırılır.
export function FinanceFilterCard<T extends string>({
  title,
  description,
  options,
  value,
  onChange,
}: FinanceFilterCardProps<T>) {
  const theme = useTheme();
  return (
    <Card variant="hero">
      <Stack gap="md">
        <Stack gap="xs">
          <Text variant="cardTitle" color="textSecondary" style={{ letterSpacing: 1.8, fontSize: 14 }}>
            {title}
          </Text>
          <Text variant="body" color="textSecondary">
            {description}
          </Text>
        </Stack>
        <Divider />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          alwaysBounceHorizontal={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: theme.spacing.xs, paddingRight: theme.spacing.lg }}
          style={{ marginRight: -theme.spacing.lg }}
        >
          {options.map((option) => {
            const selected = option.key === value;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityLabel={`${option.label} filtresi`}
                accessibilityState={{ selected }}
                onPress={() => selected || onChange(option.key)}
                hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
                style={{
                  width: 108,
                  minHeight: 44,
                  borderRadius: theme.radius.input,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.colors.brandPrimary : 'transparent',
                  paddingHorizontal: theme.spacing.sm,
                }}
              >
                <Text
                  variant="body"
                  numberOfLines={1}
                  style={{
                    color: selected ? theme.colors.brandPrimaryText : theme.colors.textSecondary,
                    fontWeight: '600',
                    textAlign: 'center',
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Stack>
    </Card>
  );
}
