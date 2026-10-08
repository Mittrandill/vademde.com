import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Button, Skeleton, Stack, Text } from '@/components/primitives';
import { AI_CONSENT_TEXT, AI_DISCLAIMER, useAiAccess } from '@/features/insights/useAiAccess';

// Akıllı öneriler / soru-cevap ekranlarının ortak kapısı: önce Plus planı, sonra KVKK onayı.
export function AiGate({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const access = useAiAccess();

  if (!access.ready) return <Skeleton height={120} borderRadius={theme.radius.widget} />;

  if (!access.isPlus) {
    return (
      <Stack gap="md">
        <Ionicons name="sparkles-outline" size={32} color={theme.colors.textPrimary} />
        <Text variant="sectionTitle">Plus ile açılır</Text>
        <Text variant="body" color="textSecondary">
          Akıllı öneriler ve soru-cevap Vademde Plus planına dahildir. Ücretsiz planda tüm kayıt ve OCR özellikleri
          eskisi gibi çalışır.
        </Text>
        <Button label="Planları gör" onPress={() => router.push('/paywall')} />
      </Stack>
    );
  }

  if (!access.consentGranted) {
    return (
      <Stack gap="md">
        <Ionicons name="shield-checkmark-outline" size={32} color={theme.colors.textPrimary} />
        <Text variant="sectionTitle">Akıllı analiz izni</Text>
        <Text variant="body" color="textSecondary">
          {AI_CONSENT_TEXT}
        </Text>
        <Text variant="caption" color="textSecondary">
          {AI_DISCLAIMER}
        </Text>
        <Button label="İzin ver" onPress={access.grantConsent} />
        <Button label="Vazgeç" variant="secondary" onPress={() => router.back()} />
      </Stack>
    );
  }

  // flex: 1 — sohbet gibi ekranı dolduran çocuklar (insights/ask) yüksekliğini buradan alır.
  return <View style={{ flex: 1 }}>{children}</View>;
}
