import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Pressable, Row, Stack, Text } from '@/components/primitives';

// docs/09-kullanici-akislari.md — OCR ürünün ana kayıt yöntemidir, manuel form bir yedektir
// (bkz. CLAUDE.md bağlayıcı kural #5: manuel giriş her zaman erişilebilir kalmalı, ama bu
// onu varsayılan/öncelikli yol yapmaz). Manuel hareket ve borç/alacak formlarının en üstüne
// konur ki kullanıcı formu elle doldurmadan önce OCR'ı fark etsin.
export function ScanPromptBanner({ description }: { description: string }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/tara')}>
      <Card style={{ borderWidth: 1, borderColor: withAlpha(theme.colors.brandPrimary, 0.4) }}>
        <Row gap="sm" align="center">
          <Row
            align="center"
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.radius.widget,
              backgroundColor: withAlpha(theme.colors.brandPrimary, 0.12),
              justifyContent: 'center',
            }}
          >
            <Ionicons name="camera-outline" size={20} color={theme.colors.brandPrimary} />
          </Row>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle">Belgeni yükle, formu doldurmakla uğraşma</Text>
            <Text variant="caption" color="textSecondary">
              {description}
            </Text>
          </Stack>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
        </Row>
      </Card>
    </Pressable>
  );
}
