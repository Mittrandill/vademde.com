import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Button } from './Button';
import { Card } from './Card';
import { Row, Stack } from './Stack';
import { Text } from './Text';

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  /** Kısa başlık — verilirse message açıklama satırı olarak altında gösterilir. */
  title?: string;
  message: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

// docs §12.18 — boş ekranda özgün illüstrasyon yerine (henüz yok) ikon + açıklama +
// net aksiyon üçlüsü; title/actionLabel opsiyoneldir, verilmezse eski tek-satır davranışı korunur.
export function EmptyState({ icon, title, message, actionLabel, onActionPress }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <Card>
      <Row gap="sm" align="flex-start">
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Ionicons name={icon} size={20} color={theme.colors.textSecondary} />
        </View>
        <Stack gap="xxs" style={{ flex: 1 }}>
          {title ? <Text variant="cardTitle">{title}</Text> : null}
          <Text variant="body" color="textSecondary">
            {message}
          </Text>
          {actionLabel && onActionPress ? (
            <View style={{ marginTop: theme.spacing.xs, alignSelf: 'flex-start' }}>
              <Button label={actionLabel} onPress={onActionPress} variant="secondary" />
            </View>
          ) : null}
        </Stack>
      </Row>
    </Card>
  );
}
