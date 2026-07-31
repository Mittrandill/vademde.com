import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Row } from './Stack';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

// docs/08-tasarim-sistemi.md §12.6 — bölüm başlıkları büyük harf caption; ağırlık
// içerikte kalsın diye 21pt sectionTitle yerine ikincil renkli küçük etiket kullanılır.
export function SectionHeader({ title, actionLabel, onActionPress }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <Row align="center">
      <Text variant="caption" color="textSecondary" style={{ flex: 1, letterSpacing: 0.6 }}>
        {/* Türkçe'de i -> İ dönüşümü yalnızca yerelli büyütmede doğru çalışır. */}
        {title.toLocaleUpperCase('tr-TR')}
      </Text>
      {actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress} hitSlop={12}>
          <Row gap="xxs">
            <Text variant="caption" color="textSecondary">
              {actionLabel}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={theme.colors.textSecondary} />
          </Row>
        </Pressable>
      ) : null}
    </Row>
  );
}
