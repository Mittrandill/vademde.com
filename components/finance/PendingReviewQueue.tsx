import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Pressable, SourceTag, Text } from '@/components/primitives';
import { DOCUMENT_TYPE_ICON, DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import type { PendingReviewDocument } from '@/features/dashboard/api';

export interface PendingReviewQueueProps {
  documents: PendingReviewDocument[];
}

// design Main.html "Kontrol bekliyor": OCR sonrası onay bekleyen belgeler (kural 1: AI çıktısı
// kullanıcı onayından geçer). Her satır kontrol ekranına gider.
export function PendingReviewQueue({ documents }: PendingReviewQueueProps) {
  const theme = useTheme();

  if (documents.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.xs }}>
        <Text variant="sectionTitle">Kontrol bekliyor</Text>
        <Text variant="label" color="textSecondary" tabular>
          {documents.length}
        </Text>
      </View>
      <View style={{ backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.widget }}>
        {documents.map((doc, index) => (
          <Pressable
            key={doc.id}
            accessibilityRole="button"
            onPress={() => router.push(`/documents/${doc.id}/review`)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              minHeight: 64,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderBottomWidth: index === documents.length - 1 ? 0 : 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <Ionicons
              name={(doc.document_type && DOCUMENT_TYPE_ICON[doc.document_type]) || 'document-outline'}
              size={theme.iconSize.xxl}
              color={theme.colors.textPrimary}
            />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="cardTitle" numberOfLines={1}>
                {doc.document_type ? DOCUMENT_TYPE_LABEL[doc.document_type] : 'Belge'}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {doc.file_name}
              </Text>
            </View>
            <SourceTag kind="check" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
