import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Card, GroupedRowIcon, Pressable, Row, Stack, Text } from '@/components/primitives';

// docs/09-kullanici-akislari.md — OCR ürünün ana kayıt yöntemidir, manuel form bir yedektir
// (CLAUDE.md bağlayıcı kural #5). Tuval YeniYukumluluk: "Ödeme planını tara" kartı — Saffron kare ikon + iki satır.
export function ScanPromptBanner({ description }: { description: string }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/tara')}>
      <Card style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
        <Row gap="sm" align="center" style={{ gap: 12 }}>
          <GroupedRowIcon name="scan" tone="brand" />
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600' }}>Belgeyi tara</Text>
            <Text variant="caption" color="textSecondary">
              {description}
            </Text>
          </Stack>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
        </Row>
      </Card>
    </Pressable>
  );
}
