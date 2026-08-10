import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { useTheme } from '@/theme';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  hareketler: 'swap-horizontal',
  tara: 'scan',
  takvim: 'calendar',
  'daha-fazla': 'grid',
};

const LABELS: Record<string, string> = {
  index: 'Ana Sayfa',
  hareketler: 'Hareketler',
  tara: 'Tara',
  takvim: 'Takvim',
  'daha-fazla': 'Daha Fazla',
};

// Kayan çubuğun üstünden taşan Tara dairesinin çapı ve barın tepesinden ne kadar
// yukarı taştığı — barın kendi yüksekliğinden (theme.layout.tabBarHeight) bağımsız,
// burada sabit tutulur ki iki değer birbirine göre elle ayarlanabilsin.
const TARA_CIRCLE_SIZE = 60;
const TARA_OVERLAP = 16;

// docs/08-tasarim-sistemi.md §12.10 — ekran kenarlarından içeride, yüksek radiuslu grafit yüzey.
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const taraIndex = state.routes.findIndex((route) => route.name === 'tara');
  const taraRoute = taraIndex >= 0 ? state.routes[taraIndex] : null;
  // Diğer sekmeler tek bir "space-between" satırında olunca, odak durumuna göre değişen
  // genişlikleri yüzünden aralarından biri (ör. Hareketler) matematiksel olarak tam barın
  // ortasına, yani tam Tara dairesinin altına denk gelip onun arkasında kayboluyordu.
  // Bunun yerine ortada dairenin genişliği kadar SABİT boş bir alan bırakan iki ayrı yarım
  // (sol/sağ) render edilir — hiçbir sekme artık o bölgeye asla giremez.
  const taraPosition = taraIndex >= 0 ? taraIndex : state.routes.length;
  const leftRoutes = state.routes.slice(0, taraPosition);
  const rightRoutes = state.routes.slice(taraPosition + 1);

  function navigateTo(route: (typeof state.routes)[number], focused: boolean) {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      navigation.navigate(route.name);
    }
  }

  // Kayıt sekmesi değişiminde global LayoutAnimation.configureNext KULLANILMAZ: bu legacy API
  // Fabric/New Architecture'da bir sonraki native layout commit'inin TAMAMINA uygulanır
  // (yalnızca bu bileşene değil). Kaydet/Sil sonrası router.replace('/(tabs)/...') ile her
  // sekme geçişinde bu tetiklenip, aynı anda çalışan başka bir shadow tree güncellemesiyle
  // (liste yeniden render, ekran unmount) çakışınca Fabric segfault veriyordu (bkz. TestFlight
  // crash raporları: "kayıt sonrası" ve "silme sonrası" çökmeler, ikisi de
  // UIManager::animationTick / LayoutAnimationDelegateProxy içinde crash).
  return (
    <View
      style={{
        position: 'absolute',
        left: theme.spacing.lg,
        right: theme.spacing.lg,
        // Alt güvenli alanın (ev göstergesi) tamamı kadar boşluk bırakmak, barı gereğinden
        // yukarıda gösteriyordu — yarısı kadarını kullanmak barı ekranın alt kenarına
        // belirgin şekilde yaklaştırırken ev göstergesiyle çakışmayı da önlüyor.
        bottom: insets.bottom * 0.5 + theme.layout.tabBarBottomGap,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: theme.layout.tabBarHeight,
          borderRadius: theme.radius.heroWidget,
          backgroundColor: theme.colors.surfaceElevated,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: theme.spacing.xs,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' }}>
          {leftRoutes.map((route) => {
            const focused = state.index === state.routes.indexOf(route);
            return (
              <TabItem
                key={route.key}
                focused={focused}
                icon={ICONS[route.name] ?? 'ellipse'}
                label={LABELS[route.name] ?? route.name}
                onPress={() => navigateTo(route, focused)}
              />
            );
          })}
        </View>

        {/* Tara dairesinin tam altına denk gelen, hiçbir sekmenin giremeyeceği sabit boşluk. */}
        <View style={{ width: TARA_CIRCLE_SIZE }} />

        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' }}>
          {rightRoutes.map((route) => {
            const focused = state.index === state.routes.indexOf(route);
            return (
              <TabItem
                key={route.key}
                focused={focused}
                icon={ICONS[route.name] ?? 'ellipse'}
                label={LABELS[route.name] ?? route.name}
                onPress={() => navigateTo(route, focused)}
              />
            );
          })}
        </View>
      </View>

      {/* Tara, barın normal akışındaki bir sekme değil — barın tam ortasında, tepesinden
          taşarak yüzen ayrı bir dairesel aksiyon düğmesi (bkz. yukarıdaki TARA_CIRCLE_SIZE/
          TARA_OVERLAP notu). Bağımsız, tam genişlikte mutlak konumlu bir katman olarak
          çizildiği için barın içindeki sekmelerden etkilenmeden her zaman tam ortada kalır.
          Her zaman marka rengiyle (seçili gibi) görünür — gerçek odak durumundan bağımsız,
          çünkü bu sekme bir "hedef" değil sabit bir aksiyon (tarama) olarak tasarlandı.
          */}
      {taraRoute ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: -TARA_OVERLAP,
            alignItems: 'center',
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={LABELS.tara}
            hitSlop={8}
            onPress={() => navigateTo(taraRoute, state.index === taraIndex)}
            style={{
              width: TARA_CIRCLE_SIZE,
              height: TARA_CIRCLE_SIZE,
              borderRadius: TARA_CIRCLE_SIZE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.brandPrimary,
              borderWidth: 3,
              borderColor: theme.colors.backgroundPrimary,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 10,
            }}
          >
            <Ionicons name={ICONS.tara} size={26} color={theme.colors.brandPrimaryText} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

interface TabItemProps {
  focused: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

function TabItem({ focused, icon, label, onPress }: TabItemProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xxs,
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
      }}
    >
      <Ionicons
        name={icon}
        size={22}
        color={focused ? theme.colors.brandPrimary : theme.colors.textSecondary}
      />
      {/* Etiket yerine görsel referanstaki gibi odaklı sekmenin altında sade bir nokta gösterge. */}
      <View
        style={{
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: focused ? theme.colors.brandPrimary : 'transparent',
        }}
      />
    </Pressable>
  );
}
