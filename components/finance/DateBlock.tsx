import { View } from 'react-native';

import { Text } from '@/components/primitives';

export interface DateBlockProps {
  date: string | Date;
  width?: number;
}

const dayFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric' });
const monthFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'short' });

// Hareket/işlem listelerinde ikon ile başlık arasına yerleşen kompakt tarih bloğu:
// üstte büyük gün rakamı, altında kısa ay adı (ör. "5" / "Ağu") — satırın sonunda küçük
// bir tarih metni yerine, tarihi ikon kadar belirgin bir birinci sınıf öğe yapar.
export function DateBlock({ date, width = 34 }: DateBlockProps) {
  const parsed = typeof date === 'string' ? new Date(date) : date;

  return (
    <View style={{ width, alignItems: 'center' }}>
      <Text style={{ fontSize: 20, lineHeight: 22, fontWeight: '700' }} numberOfLines={1}>
        {dayFormatter.format(parsed)}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {monthFormatter.format(parsed)}
      </Text>
    </View>
  );
}
