import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from '@/components/primitives';
import { withAlpha } from '@/theme/colors';
import type { ThemeColors } from '@/theme/colors';

// docs/01-finansal-kayit-modeli.md §3.4 — kayıt durumları.
export type ObligationStatus =
  | 'taslak'
  | 'inceleme_gerekli'
  | 'bekliyor'
  | 'kismen_odendi'
  | 'odendi'
  | 'kismen_tahsil_edildi'
  | 'tahsil_edildi'
  | 'gecikti'
  | 'iptal_edildi';

export const OBLIGATION_STATUS_LABEL: Record<ObligationStatus, string> = {
  taslak: 'Taslak',
  inceleme_gerekli: 'İnceleme Gerekli',
  bekliyor: 'Bekliyor',
  kismen_odendi: 'Kısmen Ödendi',
  odendi: 'Ödendi',
  kismen_tahsil_edildi: 'Kısmen Tahsil Edildi',
  tahsil_edildi: 'Tahsil Edildi',
  gecikti: 'Gecikti',
  iptal_edildi: 'İptal Edildi',
};

const COLORS: Record<ObligationStatus, keyof ThemeColors> = {
  taslak: 'textSecondary',
  inceleme_gerekli: 'accentAqua',
  bekliyor: 'textSecondary',
  kismen_odendi: 'accentAqua',
  odendi: 'success',
  kismen_tahsil_edildi: 'accentAqua',
  tahsil_edildi: 'success',
  gecikti: 'danger',
  iptal_edildi: 'textSecondary',
};

export function StatusBadge({ status }: { status: string }) {
  const theme = useTheme();
  const key = (status in OBLIGATION_STATUS_LABEL ? status : 'bekliyor') as ObligationStatus;
  const color = theme.colors[COLORS[key]];

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 3,
        borderRadius: theme.radius.pill,
        backgroundColor: withAlpha(color, 0.15),
      }}
    >
      <Text variant="caption" style={{ color, fontWeight: '600' }}>
        {OBLIGATION_STATUS_LABEL[key]}
      </Text>
    </View>
  );
}
