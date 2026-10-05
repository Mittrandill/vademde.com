import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Pressable, Text } from '@/components/primitives';
import { formatMinorAmount } from '@/utils/money';
import { HeroAmount } from './HeroAmount';

export interface HomeHeroProps {
  totalBalanceMinor: number;
  monthNetMinor: number;
  receivableMinor: number;
  payableMinor: number;
  overdueMinor: number;
  overdueCount: number;
  hidden: boolean;
  onToggleHidden: () => void;
}

const MASK = '••••••';

// Ana sayfa özeti (design Main.html): net bakiye, bu ay farkı, tahsil/ödenecek dengesi ve
// gecikme uyarısı. Tüm tutarlar çağıranın hesapladığı TL karşılıklarıdır (iş mantığı ekranda).
export function HomeHero({
  totalBalanceMinor,
  monthNetMinor,
  receivableMinor,
  payableMinor,
  overdueMinor,
  overdueCount,
  hidden,
  onToggleHidden,
}: HomeHeroProps) {
  const theme = useTheme();
  const money = (minor: number) => (hidden ? MASK : formatMinorAmount(minor));

  const total = receivableMinor + payableMinor;
  const receivableShare = total > 0 ? receivableMinor / total : 0;
  const positive = monthNetMinor >= 0;
  const monthText = `${positive ? '+' : '−'}${hidden ? MASK : formatMinorAmount(Math.abs(monthNetMinor))} bu ay`;

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="body" color="textSecondary" style={{ fontWeight: '500' }}>
            Net bakiye
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Tutarları göster' : 'Tutarları gizle'}
            onPress={onToggleHidden}
            style={{
              width: theme.touchTarget.minimum,
              height: theme.touchTarget.minimum,
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={hidden ? 'eye-off-outline' : 'eye-outline'}
              size={theme.iconSize.lg}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        </View>

        <HeroAmount amountMinor={totalBalanceMinor} hidden={hidden} />

        <View
          accessible
          accessibilityLabel={hidden ? 'Bu ay farkı gizli' : monthText}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Ionicons
            name={positive ? 'arrow-up-outline' : 'arrow-down-outline'}
            size={theme.iconSize.md}
            color={positive ? theme.colors.receivable : theme.colors.textPrimary}
            style={{ transform: [{ rotate: positive ? '45deg' : '-45deg' }] }}
          />
          <Text
            variant="label"
            tabular
            style={{
              textTransform: 'none',
              fontSize: 13,
              color: positive ? theme.colors.receivable : theme.colors.textPrimary,
            }}
          >
            {monthText}
          </Text>
        </View>
      </View>

      <View style={{ gap: 14 }}>
        {/* Denge çubuğu: yeşil tahsil, mor ödenecek. Veri yoksa yalnızca iz gösterilir. */}
        <View style={{ flexDirection: 'row', gap: 3, height: 10 }}>
          {total === 0 ? (
            <View style={{ flex: 1, borderRadius: 5, backgroundColor: theme.colors.border }} />
          ) : (
            <>
              {receivableMinor > 0 ? (
                <View
                  style={{
                    flex: Math.max(receivableShare, 0.04),
                    borderRadius: 5,
                    backgroundColor: theme.colors.receivable,
                  }}
                />
              ) : null}
              {payableMinor > 0 ? (
                <View
                  style={{
                    flex: Math.max(1 - receivableShare, 0.04),
                    borderRadius: 5,
                    backgroundColor: theme.colors.payable,
                  }}
                />
              ) : null}
            </>
          )}
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: theme.colors.receivable }} />
              <Text variant="caption" color="textSecondary">
                Tahsil edilecek
              </Text>
            </View>
            <Text variant="cardTitle" tabular>
              {money(receivableMinor)}
            </Text>
          </View>
          <View style={{ gap: 4, alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text variant="caption" color="textSecondary">
                Ödenecek
              </Text>
              <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: theme.colors.payable }} />
            </View>
            <Text variant="cardTitle" tabular>
              {money(payableMinor)}
            </Text>
          </View>
        </View>

        {overdueCount > 0 ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/obligations')}
            style={{
              minHeight: theme.touchTarget.minimum,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Ionicons name="alert-circle-outline" size={theme.iconSize.lg} color={theme.colors.danger} />
            <Text variant="cardTitle" style={{ fontSize: 13, color: theme.colors.danger, flex: 1 }}>
              {money(overdueMinor)} gecikmiş · {overdueCount} kayıt
            </Text>
            <Ionicons name="chevron-forward" size={theme.iconSize.md} color={theme.colors.danger} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
