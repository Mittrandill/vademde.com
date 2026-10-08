import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Card, Pressable, Text } from '@/components/primitives';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { WalletArt } from './HomeArt';
import { formatMinorAmount } from '@/utils/money';

export interface HomeHeroProps {
  totalBalanceMinor: number;
  monthNetMinor: number;
  receivableMinor: number;
  payableMinor: number;
  hidden: boolean;
  onToggleHidden: () => void;
}

const MASK = '••••••';

function splitAmount(text: string): { whole: string; fraction: string } {
  const index = text.lastIndexOf(',');
  return index === -1 ? { whole: text, fraction: '' } : { whole: text.slice(0, index), fraction: text.slice(index) };
}

// Ana Sayfa özet kartı (tuval AnaSayfa.dc.html): "Toplam bakiye" + gizle düğmesi, 40 pt tutar (kuruş ikincil),
// "Bu ay" farkı, ince çizgi ve Alacak | Borç iki sütunu. Tüm tutarlar çağıranın hesapladığı TL karşılıklarıdır.
export function HomeHero({
  totalBalanceMinor,
  monthNetMinor,
  receivableMinor,
  payableMinor,
  hidden,
  onToggleHidden,
}: HomeHeroProps) {
  const theme = useTheme();
  const { colors } = theme;
  const { whole, fraction } = splitAmount(formatMinorAmount(totalBalanceMinor));
  const positive = monthNetMinor >= 0;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Card style={{ padding: 20, overflow: 'hidden' }}>
        <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" pointerEvents="none">
          <Defs>
            <LinearGradient id="hero-sheen" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.07} />
              <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#hero-sheen)" />
        </Svg>
        <View pointerEvents="none" style={{ position: 'absolute', right: -36, top: 32 }}>
          <WalletArt width={150} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text color="textSecondary" style={{ fontSize: 13, fontWeight: '500' }}>
            Toplam bakiye
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Tutarları göster' : 'Tutarları gizle'}
            onPress={onToggleHidden}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name={hidden ? 'eye-off' : 'eye'} size={17} color={colors.textPrimary} />
          </Pressable>
        </View>

        <Text variant="displayBalance" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ marginTop: 8 }}>
          {hidden ? MASK : whole}
          {hidden ? null : (
            <Text variant="displayBalance" color="textSecondary" style={{ fontWeight: '600' }}>
              {fraction}
            </Text>
          )}
        </Text>

        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          <Text color="textSecondary" style={{ fontSize: 15 }}>
            Bu ay
          </Text>
          <Text tabular style={{ fontSize: 15, fontWeight: '600', color: positive ? colors.receivable : colors.textPrimary }}>
            {positive ? '+' : '−'}
            {hidden ? MASK : formatMinorAmount(Math.abs(monthNetMinor))}
          </Text>
        </View>

        <View style={{ height: 1, backgroundColor: colors.separator, marginTop: 16 }} />

        <View style={{ flexDirection: 'row', marginTop: 16 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/obligations')}
            style={{ flex: 1, gap: 4 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
              <Text color="textSecondary" style={{ fontSize: 13 }}>
                Alacak
              </Text>
            </View>
            <Text variant="displayAmount" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 20, lineHeight: 24 }}>
              {hidden ? MASK : formatMinorAmount(receivableMinor)}
            </Text>
          </Pressable>
          <View style={{ width: 1, height: 40, backgroundColor: colors.separator }} />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/obligations')}
            style={{ flex: 1, gap: 4, paddingLeft: 16 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.mutedControl }} />
              <Text color="textSecondary" style={{ fontSize: 13 }}>
                Borç
              </Text>
            </View>
            <Text variant="displayAmount" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 20, lineHeight: 24 }}>
              {hidden ? MASK : formatMinorAmount(payableMinor)}
            </Text>
          </Pressable>
        </View>
      </Card>

    </View>
  );
}
