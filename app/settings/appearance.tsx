import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { AppIconPicker } from '@/components/brand/AppIconPicker';
import { Card, SegmentedControl, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useThemePreferenceStore } from '@/store/themePreferenceStore';

const THEME_OPTIONS = [
  { key: 'system' as const, label: 'Sistem' },
  { key: 'light' as const, label: 'Açık' },
  { key: 'dark' as const, label: 'Koyu' },
];

// Ayarlar'daki "Görünüm" satırından açılan ayrı sayfa — tema ve uygulama ikonu tercihleri
// burada toplanır, Ayarlar ana ekranı yalnızca buraya giden tek bir satır barındırır.
export default function AppearanceScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const themePreference = useThemePreferenceStore((s) => s.themePreference);
  const setThemePreference = useThemePreferenceStore((s) => s.setThemePreference);

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader title="Görünüm" />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <Card>
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              TEMA
            </Text>
            <SegmentedControl options={THEME_OPTIONS} value={themePreference} onChange={setThemePreference} />
          </Stack>
        </Card>

        <Card>
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              UYGULAMA İKONU
            </Text>
            <AppIconPicker />
          </Stack>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
