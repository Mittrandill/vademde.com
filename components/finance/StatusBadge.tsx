import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from '@/components/primitives';
import { Ionicons } from '@expo/vector-icons';
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

// Yeni tasarım: durum, renkli dolgu yerine renkli metin (+ ödenmişlerde onay ikonu). Ödeme
// bekleyen = payable, gerçekleşen = receivable, gecikme = danger, kontrol gerektiren = attention.
const COLORS: Record<ObligationStatus, keyof ThemeColors> = {
  taslak: 'textSecondary',
  inceleme_gerekli: 'attentionMarker',
  bekliyor: 'textSecondary',
  kismen_odendi: 'payable',
  odendi: 'receivable',
  kismen_tahsil_edildi: 'receivable',
  tahsil_edildi: 'receivable',
  gecikti: 'danger',
  iptal_edildi: 'textSecondary',
};

const DONE: ObligationStatus[] = ['odendi', 'tahsil_edildi'];

export function StatusBadge({ status }: { status: string }) {
  const theme = useTheme();
  const key = (status in OBLIGATION_STATUS_LABEL ? status : 'bekliyor') as ObligationStatus;
  const color = theme.colors[COLORS[key]];

  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {DONE.includes(key) ? <Ionicons name="checkmark" size={theme.iconSize.sm} color={color} /> : null}
      <Text variant="caption" style={{ color, fontWeight: '600', fontSize: 12 }}>
        {OBLIGATION_STATUS_LABEL[key]}
      </Text>
    </View>
  );
}
