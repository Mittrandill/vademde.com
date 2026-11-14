import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, GroupedRowIcon, Pressable, Row, Stack, Tag, Text } from '@/components/primitives';
import { useOnboardingStore } from '@/store/onboardingStore';
import { t } from '@/i18n';

interface FirstRecordOption {
  key: 'scan' | 'voice' | 'obligation' | 'transaction';
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
  /** Sesli kayıt Plus özelliğidir (AiGate); ücretsiz kullanıcı o ekranda planları görür. */
  plus?: boolean;
  primary?: boolean;
}

const OPTIONS: FirstRecordOption[] = [
  { key: 'scan', icon: 'scan-outline', href: '/(tabs)/tara', primary: true },
  { key: 'voice', icon: 'mic-outline', href: '/voice', plus: true },
  { key: 'obligation', icon: 'document-text-outline', href: '/obligations/new' },
  { key: 'transaction', icon: 'swap-vertical-outline', href: '/transactions/new' },
];

// İlk kurulumdan sonra açılan tek adım (app/workspace-setup → buraya). Yeni kullanıcıların çoğu
// boş Ana Sayfa'da hiçbir kayıt eklemeden ayrılıyordu; burada ilk işi tek dokunuşla başlatırlar.
// Deneme teklifi (paywall) ilk kayıttan sonra Ana Sayfa'ya dönülünce açılır; "Şimdilik geç"
// denirse hemen açılır (bkz. app/(tabs)/index.tsx, onboardingStore.trialOfferPendingSince).
export default function FirstRecordScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const setTrialOfferPendingSince = useOnboardingStore((s) => s.setTrialOfferPendingSince);

  const open = (option: FirstRecordOption) => {
    // Tara bir sekme: bu ekran kapanıp sekmeler içinde Tara'ya geçilir. Diğerleri bu ekranın
    // yerine açılır; böylece kayıt ekranından geri/kaydet sonrası doğrudan Ana Sayfa'ya dönülür.
    if (option.key === 'scan') router.dismissTo(option.href);
    else router.replace(option.href);
  };

  const skip = () => {
    setTrialOfferPendingSince(null);
    router.replace('/paywall');
  };

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard, paddingTop: theme.spacing.xxl, flexGrow: 1 }}>
        <Stack gap="xl" style={{ flex: 1 }}>
          <Stack gap="xs">
            <Text accessibilityRole="header" variant="pageTitle">
              {t('onboarding.firstRecord.title')}
            </Text>
            <Text variant="body" color="textSecondary">
              {t('onboarding.firstRecord.body')}
            </Text>
          </Stack>

          <Stack gap="sm">
            {OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityLabel={t(`onboarding.firstRecord.${option.key}`)}
                onPress={() => open(option)}
              >
                <Row
                  gap="sm"
                  align="center"
                  style={{
                    minHeight: 72,
                    padding: theme.spacing.md,
                    borderRadius: theme.radius.widget,
                    backgroundColor: theme.colors.surfacePrimary,
                    borderWidth: option.primary ? 1.5 : 0,
                    borderColor: theme.colors.brandPrimary,
                  }}
                >
                  <GroupedRowIcon name={option.icon} tone={option.primary ? 'brand' : 'brandSoft'} size={44} />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Row gap="xs" align="center">
                      <Text style={{ fontWeight: '600' }}>{t(`onboarding.firstRecord.${option.key}`)}</Text>
                      {option.plus ? <Tag label="Plus" tone="brand" /> : null}
                    </Row>
                    <Text variant="caption" color="textSecondary">
                      {t(`onboarding.firstRecord.${option.key}Hint`)}
                    </Text>
                  </Stack>
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.mutedControl} />
                </Row>
              </Pressable>
            ))}
          </Stack>

          <View style={{ flex: 1 }} />
          <Button label={t('onboarding.firstRecord.later')} variant="text" onPress={skip} />
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}
