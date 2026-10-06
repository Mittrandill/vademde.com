import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Row } from './Stack';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
  /** title = 20 pt/700 bölüm başlığı (.h2, varsayılan); overline = büyük harf küçük etiket (.ov). */
  variant?: 'title' | 'overline';
}

// vademde.css .shd: solda başlık, sağda 15 pt/500 ikincil bağlantı ("Takvim", "Tümü").
export function SectionHeader({ title, actionLabel, onActionPress, variant = 'title' }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <Row align="center" style={{ alignItems: 'flex-end', marginTop: theme.spacing.xl, marginBottom: 10 }}>
      <Text variant={variant === 'overline' ? 'label' : 'sectionTitle'} color={variant === 'overline' ? 'textSecondary' : 'textPrimary'} style={{ flex: 1 }}>
        {title}
      </Text>
      {actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress} hitSlop={12}>
          <Text color="textSecondary" style={{ fontSize: 15, fontWeight: '500' }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </Row>
  );
}
