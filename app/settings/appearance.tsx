import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { AppIconPicker } from '@/components/brand/AppIconPicker';
import { SegmentedControl, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useThemePreferenceStore } from '@/store/themePreferenceStore';
import { useLanguagePreferenceStore } from '@/store/languagePreferenceStore';
import { useTranslation } from '@/i18n';

// Ayarlar'daki "Görünüm" satırından açılan ayrı sayfa — tema, dil ve uygulama ikonu tercihleri
// burada toplanır, Ayarlar ana ekranı yalnızca buraya giden tek bir satır barındırır.
export default function AppearanceScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const { t } = useTranslation();
  const themePreference = useThemePreferenceStore((s) => s.themePreference);
  const setThemePreference = useThemePreferenceStore((s) => s.setThemePreference);
  const languagePreference = useLanguagePreferenceStore((s) => s.languagePreference);
  const setLanguagePreference = useLanguagePreferenceStore((s) => s.setLanguagePreference);

  const themeOptions = [
    { key: 'system' as const, label: t('settings.appearance.themeSystem') },
    { key: 'light' as const, label: t('settings.appearance.themeLight') },
    { key: 'dark' as const, label: t('settings.appearance.themeDark') },
  ];
  // Dil adları her dilde kendi yazımıyla gösterilir (yanlış dile geçen kullanıcı geri bulabilsin).
  const languageOptions = [
    { key: 'system' as const, label: t('settings.appearance.languageSystem') },
    { key: 'tr' as const, label: 'Türkçe' },
    { key: 'en' as const, label: 'English' },
  ];

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader title={t('settings.appearance.title')} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <Stack gap="sm">
          <Text variant="label" color="textSecondary">
            {t('settings.appearance.theme')}
          </Text>
          <SegmentedControl options={themeOptions} value={themePreference} onChange={setThemePreference} stretch />
          <Text variant="caption" color="textSecondary">
            {t('settings.appearance.themeHint')}
          </Text>
        </Stack>

        <Stack gap="sm">
          <Text variant="label" color="textSecondary">
            {t('settings.appearance.language')}
          </Text>
          <SegmentedControl
            options={languageOptions}
            value={languagePreference}
            onChange={setLanguagePreference}
            stretch
          />
          <Text variant="caption" color="textSecondary">
            {t('settings.appearance.languageHint')}
          </Text>
        </Stack>

        <Stack gap="sm">
          <Text variant="label" color="textSecondary">
            {t('settings.appearance.appIcon')}
          </Text>
          <AppIconPicker />
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}
