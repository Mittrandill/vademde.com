import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Card, Pressable, Row, Stack, Text } from '@/components/primitives';
import { Amount } from './Amount';

export interface BalanceHeroProps {
  totalBalanceMinor: number;
  monthNetMinor: number;
  hidden: boolean;
  onToggleHidden: () => void;
}

const HIDDEN_MASK = '••••••';

export function BalanceHero({ totalBalanceMinor, monthNetMinor, hidden, onToggleHidden }: BalanceHeroProps) {
  const theme = useTheme();

  return (
    <Card style={{ borderRadius: theme.radius.heroWidget }}>
      <Stack gap="sm">
        <Row align="center">
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
            TOPLAM BAKİYE
          </Text>
          <Pressable onPress={onToggleHidden} hitSlop={12}>
            <Ionicons
              name={hidden ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        </Row>
        {hidden ? (
          <Text variant="displayBalance">{HIDDEN_MASK}</Text>
        ) : (
          <Amount amountMinor={totalBalanceMinor} variant="displayBalance" />
        )}
        <Row gap="xs">
          <Text variant="body" color="textSecondary">
            Bu ay:
          </Text>
          {hidden ? (
            <Text variant="body" color="textSecondary">
              {HIDDEN_MASK}
            </Text>
          ) : (
            <Amount
              amountMinor={Math.abs(monthNetMinor)}
              direction={monthNetMinor >= 0 ? 'income' : 'expense'}
              variant="body"
            />
          )}
        </Row>
      </Stack>
    </Card>
  );
}
