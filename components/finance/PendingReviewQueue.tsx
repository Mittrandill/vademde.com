import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Card, Pressable, Row, SectionHeader, Stack, Text } from '@/components/primitives';
import { DOCUMENT_TYPE_ICON, DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import type { PendingReviewDocument } from '@/features/dashboard/api';

export interface PendingReviewQueueProps {
  documents: PendingReviewDocument[];
}

export function PendingReviewQueue({ documents }: PendingReviewQueueProps) {
  const theme = useTheme();

  if (documents.length === 0) return null;

  return (
    <Stack gap="sm">
      <SectionHeader title="İnceleme Bekleyen Belgeler" />
      <Stack gap="xs">
        {documents.map((doc) => (
          <Pressable key={doc.id} onPress={() => router.push(`/documents/${doc.id}/review`)}>
            <Card>
              <Row gap="sm">
                <Ionicons
                  name={(doc.document_type && DOCUMENT_TYPE_ICON[doc.document_type]) || 'document-outline'}
                  size={22}
                  color={theme.colors.accentViolet}
                />
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="cardTitle" numberOfLines={1}>
                    {doc.file_name}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {doc.document_type ? DOCUMENT_TYPE_LABEL[doc.document_type] : 'Belge türü belirlenmedi'}
                  </Text>
                </Stack>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
              </Row>
            </Card>
          </Pressable>
        ))}
      </Stack>
    </Stack>
  );
}
