import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Divider, Pressable, ProgressRing, Row, Stack, Text } from '@/components/primitives';
import { Amount } from './Amount';

export interface BalanceHeroProps {
  totalBalanceMinor: number;
  monthNetMinor: number;
  receivableMinor: number;
  payableMinor: number;
  hidden: boolean;
  onToggleHidden: () => void;
}

const HIDDEN_MASK = '••••••';
const RING_SIZE = 112;
const RING_STROKE = 12;

export function BalanceHero({
  totalBalanceMinor,
  monthNetMinor,
  receivableMinor,
  payableMinor,
  hidden,
  onToggleHidden,
}: BalanceHeroProps) {
  const theme = useTheme();

  // Halka, toplam bakiyenin değil borç/alacak dengesinin görselidir: dolu kısım
  // alacağın toplam içindeki payı. Kayıt yoksa halka boş kalır.
  const directionalTotal = receivableMinor + payableMinor;
  const receivableShare = directionalTotal > 0 ? receivableMinor / directionalTotal : 0;

  return (
    <Card variant="hero">
      <Stack gap="md">
        <Row align="center">
          <Text variant="caption" color="textSecondary" style={{ flex: 1, letterSpacing: 0.6 }}>
            TOPLAM BAKİYE
          </Text>
          <Pressable
            onPress={onToggleHidden}
            hitSlop={12}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              // Kart artık diğerleriyle aynı yüzeyde; kontrast düşük kaldığı için
              // düğme zemini yerine kenarlıkla ayrışıyor.
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Ionicons
              name={hidden ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        </Row>

        <Row gap="md" align="center">
          <Stack gap="xs" style={{ flex: 1 }}>
            {hidden ? (
              <Text variant="displayAmount">{HIDDEN_MASK}</Text>
            ) : (
              <Amount
                amountMinor={totalBalanceMinor}
                variant="displayAmount"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              />
            )}
            <Row gap="xs">
              <Text variant="caption" color="textSecondary">
                Bu ay:
              </Text>
              {hidden ? (
                <Text variant="caption" color="textSecondary">
                  {HIDDEN_MASK}
                </Text>
              ) : (
                <Amount
                  amountMinor={Math.abs(monthNetMinor)}
                  direction={monthNetMinor >= 0 ? 'income' : 'expense'}
                  variant="caption"
                />
              )}
            </Row>
          </Stack>

          <ProgressRing
            size={RING_SIZE}
            strokeWidth={RING_STROKE}
            progress={receivableShare}
            color={theme.colors.success}
            trackColor={withAlpha(theme.colors.success, 0.18)}
            cap
          >
            <Stack gap="xxs" align="center">
              <Ionicons name="wallet-outline" size={24} color={theme.colors.textSecondary} />
              <Text variant="caption" color="textSecondary">
                Bakiye
              </Text>
            </Stack>
          </ProgressRing>
        </Row>

        <Divider />

        <Row>
          <LegendItem
            label="Alacak"
            dotColor={theme.colors.success}
            amountMinor={receivableMinor}
            direction="receivable"
            hidden={hidden}
          />
          <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.md }} />
          <LegendItem
            label="Borç"
            dotColor={theme.colors.textSecondary}
            amountMinor={payableMinor}
            direction="payable"
            hidden={hidden}
          />
        </Row>
      </Stack>
    </Card>
  );
}

interface LegendItemProps {
  label: string;
  dotColor: string;
  amountMinor: number;
  direction: 'payable' | 'receivable';
  hidden: boolean;
}

function LegendItem({ label, dotColor, amountMinor, direction, hidden }: LegendItemProps) {
  return (
    <Stack gap="xxs" style={{ flex: 1 }}>
      <Row gap="xs">
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
      </Row>
      {hidden ? (
        <Text variant="cardTitle" color="textSecondary">
          {HIDDEN_MASK}
        </Text>
      ) : (
        <Amount
          amountMinor={amountMinor}
          direction={direction}
          variant="cardTitle"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        />
      )}
    </Stack>
  );
}
