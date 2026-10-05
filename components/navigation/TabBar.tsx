import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { useTheme } from '@/theme';
import { Text } from '@/components/primitives';

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  index: { active: 'home', inactive: 'home-outline' },
  hareketler: { active: 'swap-horizontal', inactive: 'swap-horizontal' },
  tara: { active: 'scan', inactive: 'scan' },
  takvim: { active: 'calendar', inactive: 'calendar-outline' },
  'daha-fazla': { active: 'grid', inactive: 'grid-outline' },
};

const LABELS: Record<string, string> = {
  index: 'Ana Sayfa',
  hareketler: 'Hareketler',
  tara: 'Tara',
  takvim: 'Takvim',
  'daha-fazla': 'Daha Fazla',
};

// design Main.html alt çubuğu: tam genişlikte düz yüzey + üst çizgi; ortada yukarı taşan
// yuvarlatılmış kare "Tara" düğmesi (action rengi, çubuk renginde halka). Aktif sekme:
// kalın etiket + altında nokta.
const TARA_SIZE = 58;
const TARA_RING = 5;
const TARA_LIFT = 22;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // Çubuğun üst kenarı eski yüzen çubuğunkiyle aynı yükseklikte kalır (theme.layout.* ile
  // hesaplanan, tara.tsx'in kamera kontrollerini konumlandırdığı değer); altındaki alan
  // güvenli alanı doldurur.
  const bottomInset = insets.bottom * 0.5 + theme.layout.tabBarBottomGap;

  function navigateTo(route: (typeof state.routes)[number], focused: boolean) {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  }

  // Kayıt sekmesi değişiminde global LayoutAnimation.configureNext KULLANILMAZ: bu legacy API
  // Fabric/New Architecture'da bir sonraki native layout commit'inin TAMAMINA uygulanır ve
  // başka bir shadow tree güncellemesiyle çakışınca segfault veriyordu (bkz. TestFlight
  // crash raporları: UIManager::animationTick / LayoutAnimationDelegateProxy).
  return (
    <View
      accessibilityRole="tablist"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: theme.layout.tabBarHeight + bottomInset,
        paddingBottom: bottomInset,
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: theme.colors.surfacePrimary,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingHorizontal: theme.spacing.xs,
      }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const icons = ICONS[route.name] ?? { active: 'ellipse', inactive: 'ellipse-outline' };
        const label = LABELS[route.name] ?? route.name;

        if (route.name === 'tara') {
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel="Belge tara"
              accessibilityState={{ selected: focused }}
              onPress={() => navigateTo(route, focused)}
              style={{ flex: 1, alignItems: 'center', gap: 6, marginTop: -TARA_LIFT }}
            >
              <View
                style={{
                  width: TARA_SIZE,
                  height: TARA_SIZE,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.action,
                  borderWidth: TARA_RING,
                  borderColor: theme.colors.surfacePrimary,
                  // Halka çubuk rengindedir; boyut dışa taşmasın diye kutu büyütülmez, iç ölçü sabit kalır.
                  boxSizing: 'content-box',
                }}
              >
                <Ionicons name={icons.active} size={26} color={theme.colors.onAction} />
              </View>
              <Text variant="caption" style={{ fontSize: 11, fontWeight: '600' }} color="textSecondary">
                {label}
              </Text>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            onPress={() => navigateTo(route, focused)}
            style={{
              flex: 1,
              minHeight: theme.touchTarget.minimum,
              alignItems: 'center',
              gap: theme.spacing.xxs,
              paddingTop: 10,
            }}
          >
            <Ionicons
              name={focused ? icons.active : icons.inactive}
              size={23}
              color={focused ? theme.colors.textPrimary : theme.colors.textSecondary}
            />
            <Text
              variant="caption"
              numberOfLines={1}
              color={focused ? 'textPrimary' : 'textSecondary'}
              style={{ fontSize: 11, fontWeight: focused ? '700' : '500' }}
            >
              {label}
            </Text>
            <View
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: focused ? theme.colors.attentionMarker : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
