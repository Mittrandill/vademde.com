import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Button, Skeleton, Stack, Text } from '@/components/primitives';
import { aiConsentText, aiDisclaimer, useAiAccess } from '@/features/insights/useAiAccess';
import { t } from '@/i18n';

// Akıllı öneriler / soru-cevap ekranlarının ortak kapısı: önce Plus planı, sonra KVKK onayı.
export function AiGate({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const access = useAiAccess();

  if (!access.ready) return <Skeleton height={120} borderRadius={theme.radius.widget} />;

  if (!access.isPlus) {
    return (
      <Stack gap="md">
        <Ionicons name="sparkles-outline" size={32} color={theme.colors.textPrimary} />
        <Text variant="sectionTitle">{t('finance.aiGate.plusTitle')}</Text>
        <Text variant="body" color="textSecondary">
          {t('finance.aiGate.plusBody')}
        </Text>
        <Button label={t('finance.aiGate.seePlans')} onPress={() => router.push('/paywall')} />
      </Stack>
    );
  }

  if (!access.consentGranted) {
    return (
      <Stack gap="md">
        <Ionicons name="shield-checkmark-outline" size={32} color={theme.colors.textPrimary} />
        <Text variant="sectionTitle">{t('finance.aiGate.consentTitle')}</Text>
        <Text variant="body" color="textSecondary">
          {aiConsentText()}
        </Text>
        <Text variant="caption" color="textSecondary">
          {aiDisclaimer()}
        </Text>
        <Button label={t('finance.aiGate.allow')} onPress={access.grantConsent} />
        <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
      </Stack>
    );
  }

  // flex: 1 — sohbet gibi ekranı dolduran çocuklar (insights/ask) yüksekliğini buradan alır.
  return <View style={{ flex: 1 }}>{children}</View>;
}
