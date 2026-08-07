import { useEffect } from 'react';
import { LayoutAnimation, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { useTheme } from '@/theme';
import { Text } from '@/components/primitives';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  hareketler: 'swap-horizontal',
  tara: 'scan',
  takvim: 'calendar',
  raporlar: 'bar-chart',
  'daha-fazla': 'grid',
};

const LABELS: Record<string, string> = {
  index: 'Ana Sayfa',
  hareketler: 'Hareketler',
  tara: 'Tara',
  takvim: 'Takvim',
  raporlar: 'Raporlar',
  'daha-fazla': 'Daha Fazla',
};

// docs/08-tasarim-sistemi.md §12.10 — ekran kenarlarından içeride, yüksek radiuslu grafit yüzey.
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(theme.motion.stateChangeMs, 'easeInEaseOut', 'opacity')
    );
  }, [state.index, theme.motion.stateChangeMs]);

  return (
    <View
      style={{
        position: 'absolute',
        left: theme.spacing.lg,
        right: theme.spacing.lg,
        bottom: insets.bottom + theme.layout.tabBarBottomGap,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
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
      {state.routes.map((route, index) => {
        const focused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TabItem
            key={route.key}
            focused={focused}
            icon={ICONS[route.name] ?? 'ellipse'}
            label={LABELS[route.name] ?? route.name}
            onPress={onPress}
          />
        );
      })}
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
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xxs,
        paddingVertical: theme.spacing.xs,
        // 6 sekme dar telefonlara sığsın diye yatay padding kısıldı; aktif sekme
        // etiketiyle birlikte en dar cihazda (375pt) bile taşmıyor.
        paddingHorizontal: focused ? theme.spacing.sm : theme.spacing.xs,
        flexShrink: focused ? 1 : 0,
        borderRadius: 999,
        backgroundColor: focused ? theme.colors.brandPrimary : 'transparent',
      }}
    >
      <Ionicons
        name={icon}
        size={20}
        color={focused ? theme.colors.brandPrimaryText : theme.colors.textSecondary}
      />
      {focused ? (
        <Text
          variant="caption"
          numberOfLines={1}
          style={{ color: theme.colors.brandPrimaryText, fontWeight: '600' }}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}
