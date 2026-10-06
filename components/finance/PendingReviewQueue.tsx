import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Group, Pressable, Text } from '@/components/primitives';
import type { PendingReviewDocument } from '@/features/dashboard/api';

export interface PendingReviewQueueProps {
  documents: PendingReviewDocument[];
}

// Tuval AnaSayfa "N belge onay bekliyor": üst üste binen belge küçük resimleri + iki satır metin.
// Kural 1: OCR sonucu kullanıcı onayından geçer; satır ilk belgenin kontrol ekranına gider.
export function PendingReviewQueue({ documents }: PendingReviewQueueProps) {
  const theme = useTheme();
  if (documents.length === 0) return null;
  const first = documents[0];

  return (
    <Group inset={16}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/documents/${first.id}/review`)}
        style={{ minHeight: 56, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={{ width: 66, height: 56 }}>
          <Thumb style={{ left: 0, top: 0, transform: [{ rotate: '-6deg' }] }} />
          <Thumb style={{ left: 20, top: 0 }} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontWeight: '600' }}>{documents.length} belge onay bekliyor</Text>
          <Text variant="caption" color="textSecondary">
            Bir alanda emin olmadığımız var
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
      </Pressable>
    </Group>
  );
}

function Thumb({ style }: { style: object }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          position: 'absolute',
          width: 44,
          height: 56,
          borderRadius: 6,
          backgroundColor: '#FBFAF6',
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingVertical: 7,
          paddingHorizontal: 6,
          gap: 4,
        },
        style,
      ]}
    >
      <View style={{ height: 3, borderRadius: 2, backgroundColor: '#D5D4CC', width: '55%' }} />
      <View style={{ height: 3, borderRadius: 2, backgroundColor: '#D5D4CC' }} />
      <View style={{ height: 3, borderRadius: 2, backgroundColor: '#9C9B93', width: '70%' }} />
      <View style={{ height: 3, borderRadius: 2, backgroundColor: '#D5D4CC' }} />
    </View>
  );
}
