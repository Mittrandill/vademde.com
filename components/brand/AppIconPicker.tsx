import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAppIcon, setAppIcon, type IconName } from '@howincodes/expo-dynamic-app-icon';

import { useTheme } from '@/theme';
import { Pressable, Row, Text } from '@/components/primitives';

type IconOptionKey = 'DEFAULT' | IconName;

const ICON_OPTIONS: { key: IconOptionKey; label: string; source: number }[] = [
  { key: 'DEFAULT', label: 'Varsayılan', source: require('../../assets/app-icons/varsayilan.png') },
  { key: 'koyu', label: 'Koyu', source: require('../../assets/app-icons/koyu.png') },
  { key: 'monokrom', label: 'Monokrom', source: require('../../assets/app-icons/monokrom.png') },
  { key: 'mor', label: 'Mor', source: require('../../assets/app-icons/mor.png') },
];

// Ayarlar'daki "UYGULAMA İKONU" bölümü: kullanıcı, Vademde_Tam_Logo_Paketi_v2.0'daki hazır
// varyantlardan (bkz. assets/app-icons/) birini seçerek ana ekrandaki uygulama simgesini
// değiştirebilir — bkz. @howincodes/expo-dynamic-app-icon ve app.json plugin tanımı. Yalnızca
// native (Development Build/EAS) derlemede çalışır; Expo Go bu API'yi desteklemez.
export function AppIconPicker() {
  const theme = useTheme();
  const [current, setCurrent] = useState<IconOptionKey>('DEFAULT');
  const [pending, setPending] = useState<IconOptionKey | null>(null);

  useEffect(() => {
    getAppIcon()
      .then((name) => setCurrent((name === 'DEFAULT' ? 'DEFAULT' : name) as IconOptionKey))
      .catch(() => {});
  }, []);

  const select = async (key: IconOptionKey) => {
    if (key === current || pending) return;
    setPending(key);
    const result = await setAppIcon(key === 'DEFAULT' ? null : key, false).catch(() => false as const);
    if (result !== false) setCurrent(key);
    setPending(null);
  };

  return (
    <Row gap="md" style={{ flexWrap: 'wrap' }}>
      {ICON_OPTIONS.map((option) => {
        const isActive = current === option.key;
        return (
          <Pressable
            key={option.key}
            onPress={() => select(option.key)}
            accessibilityRole="button"
            accessibilityLabel={`${option.label} uygulama ikonu`}
            disabled={pending !== null}
            style={{ alignItems: 'center', width: 72, opacity: pending && !isActive ? 0.5 : 1 }}
          >
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 14,
                overflow: 'hidden',
                borderWidth: isActive ? 2 : 1,
                borderColor: isActive ? theme.colors.brandPrimary : theme.colors.border,
              }}
            >
              <Image source={option.source} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              {isActive ? (
                <View
                  style={{
                    position: 'absolute',
                    bottom: 2,
                    right: 2,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: theme.colors.brandPrimary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="checkmark" size={12} color={theme.colors.brandPrimaryText} />
                </View>
              ) : null}
            </View>
            <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ marginTop: theme.spacing.xxs }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </Row>
  );
}
