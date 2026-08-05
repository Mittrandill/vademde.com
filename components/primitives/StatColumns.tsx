import { Fragment, type ReactNode } from 'react';

import { useTheme } from '@/theme';
import type { ThemeColors } from '@/theme/colors';
import { Divider } from './Divider';
import { Row, Stack } from './Stack';
import { Text } from './Text';

export interface StatColumn {
  label: string;
  value: ReactNode;
  labelColor?: keyof ThemeColors;
  valueColor?: keyof ThemeColors;
  align?: 'flex-start' | 'flex-end';
}

export interface StatColumnsProps {
  columns: StatColumn[];
}

// Hero kartlarındaki iki-sütun özet satırı ve liste ekranlarındaki sayaç şeridi
// (AKTİF/TOPLAM/GECİKMİŞ, ALACAK/BORÇ) için ortak atom — sütunlar arasına otomatik
// dikey Divider basar.
export function StatColumns({ columns }: StatColumnsProps) {
  const theme = useTheme();

  return (
    <Row>
      {columns.map((column, index) => (
        <Fragment key={index}>
          {index > 0 ? <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.sm }} /> : null}
          <Stack gap="xxs" style={{ flex: 1 }} align={column.align}>
            <Text variant="caption" color={column.labelColor ?? 'textSecondary'} numberOfLines={1}>
              {column.label}
            </Text>
            <Text variant="cardTitle" tabular numberOfLines={1} color={column.valueColor}>
              {column.value}
            </Text>
          </Stack>
        </Fragment>
      ))}
    </Row>
  );
}
