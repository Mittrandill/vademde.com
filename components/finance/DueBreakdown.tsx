import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Card, Row, Stack, Text } from '@/components/primitives';
import { formatMinorAmount } from '@/utils/money';
import type { DueBreakdown as DueBreakdownData } from '@/features/obligations/api';

// docs/01-finansal-kayit-modeli.md §3.2.1 — tek bir "toplam borç" rakamı, tekrarlayan
// kayıtlarda (maaş, kira, vergi/SGK) yanıltıcıdır: 4 aylık maaş girer girmez dört ayın
// tamamı bugünün borcu gibi görünür. Bu bileşen borcun/alacağın aynı üç kırılımını her
// yüzeyde birebir aynı sırayla gösterir, böylece kullanıcı hangi rakama baktığını bilir.
//
// Gecikmiş rakamı yalnızca sıfırdan büyükken kırmızı okunur; sıfırda nötr kalır ki her
// ekranda kırmızı bir sayı görme yorgunluğu oluşmasın (docs/08 §12.4 — vurgu rengi az
// kullanılır).
export function DueBreakdown({
  data,
  direction,
}: {
  data: DueBreakdownData;
  direction: 'payable' | 'receivable';
}) {
  const theme = useTheme();
  const isPayable = direction === 'payable';
  const hasOverdue = data.overdueMinor > 0;

  return (
    <Card>
      <Row align="stretch">
        <Metric
          label="GECİKMİŞ"
          value={formatMinorAmount(data.overdueMinor)}
          caption={
            hasOverdue
              ? `${data.overdueCount} vade`
              : isPayable
                ? 'Geciken yok'
                : 'Geciken tahsilat yok'
          }
          valueColor={hasOverdue ? theme.colors.danger : theme.colors.textPrimary}
        />
        <Divider />
        <Metric
          label="BU AY"
          value={formatMinorAmount(data.dueThisMonthMinor)}
          caption={isPayable ? 'Ödenecek' : 'Tahsil edilecek'}
          valueColor={theme.colors.textPrimary}
        />
        <Divider />
        <Metric
          label="TOPLAM KALAN"
          value={formatMinorAmount(data.remainingTotalMinor)}
          caption="Tüm vadeler"
          valueColor={theme.colors.textSecondary}
        />
      </Row>
    </Card>
  );
}

function Divider() {
  const theme = useTheme();
  return <View style={{ width: 1, backgroundColor: theme.colors.border, marginHorizontal: theme.spacing.sm }} />;
}

function Metric({
  label,
  value,
  caption,
  valueColor,
}: {
  label: string;
  value: string;
  caption: string;
  valueColor: string;
}) {
  return (
    <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
      <Text
        variant="cardTitle"
        tabular
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ color: valueColor }}
      >
        {value}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {caption}
      </Text>
    </Stack>
  );
}
