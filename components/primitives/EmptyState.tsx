import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Card } from './Card';
import { Row } from './Stack';
import { Text } from './Text';

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
}

export function EmptyState({ icon, message }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <Card>
      <Row gap="sm">
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
        <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
          {message}
        </Text>
      </Row>
    </Card>
  );
}
