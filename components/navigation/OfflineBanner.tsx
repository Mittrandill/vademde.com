import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';

import { useTheme } from '@/theme';
import { Text } from '@/components/primitives';

// Tuval: Cevrimdisi — üstte ince şerit. Şerit akışın içinde yer alır ve durum çubuğu
// boşluğunu kendisi üstlenir; altındaki ekranların SafeAreaView'ları bu yüzden ek boşluk eklemez.
export function OfflineBanner({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false || state.isInternetReachable === false);
    });
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {offline ? (
        <View
          accessibilityRole="alert"
          style={{
            paddingTop: insets.top,
            backgroundColor: theme.colors.fill,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.separator,
          }}
        >
          <View style={{ height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ionicons name="cloud-offline-outline" size={15} color={theme.colors.textSecondary} />
            <Text variant="caption" color="textSecondary" style={{ fontWeight: '500' }}>
              Çevrimdışı · değişiklikler cihazda saklanıyor
            </Text>
          </View>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
