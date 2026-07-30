import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Card, Row, Stack, Text } from '@/components/primitives';
import { formatMinorAmount } from '@/utils/money';
import type { CategoryBreakdownItem } from '@/features/reports/api';

export interface CategoryBreakdownListProps {
  title: string;
  items: CategoryBreakdownItem[];
  emptyLabel: string;
  limit?: number;
  headerRight?: ReactNode;
}

export function CategoryBreakdownList({ title, items, emptyLabel, limit = 6, headerRight }: CategoryBreakdownListProps) {
  const theme = useTheme();
  const visible = items.slice(0, limit);
  const remaining = items.length - visible.length;

  return (
    <Card>
      <Stack gap="sm">
        <Row align="center">
          <Text variant="sectionTitle" style={{ flex: 1 }}>
            {title}
          </Text>
          {headerRight}
        </Row>
        {visible.length === 0 ? (
          <Text variant="body" color="textSecondary">
            {emptyLabel}
          </Text>
        ) : (
          <Stack gap="sm">
            {visible.map((item) => (
              <Stack
                key={item.categoryId ?? 'uncategorized'}
                gap="xxs"
                accessibilityLabel={`${item.name}: ${formatMinorAmount(item.amountMinor)}, toplamın yüzde ${Math.round(item.percentage * 100)}`}
              >
                <Row align="center">
                  <Text variant="body" style={{ flex: 1 }}>
                    {item.name}
                  </Text>
                  <Text variant="body" tabular>
                    {formatMinorAmount(item.amountMinor)}
                  </Text>
                </Row>
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: theme.colors.border,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: '100%',
                      width: `${Math.max(2, item.percentage * 100)}%`,
                      borderRadius: 3,
                      backgroundColor: theme.colors.accentViolet,
                    }}
                  />
                </View>
              </Stack>
            ))}
            {remaining > 0 ? (
              <Text variant="caption" color="textSecondary">
                +{remaining} kategori daha
              </Text>
            ) : null}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
