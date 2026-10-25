import { useState } from 'react';
import { Alert, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Pressable, Text } from '@/components/primitives';
import {
  QuotaExceededError,
  discardDocument,
  listDraftDocuments,
  startProcessing,
} from '@/features/documents/api';
import { getCurrentOcrUsage, currentPeriodMonth } from '@/features/subscriptions/api';
import { queryKeys } from '@/services/queryKeys';
import { OCR_CONSENT_KEY } from '@/utils/storageKeys';
import { friendlyErrorMessage } from '@/utils/alerts';
import { localeDateFormatter } from '@/i18n/format';
import { t } from '@/i18n';

const dayMonth = localeDateFormatter({ day: 'numeric', month: 'long' });

// Kota doluyken "taslak olarak saklanan" belgeler (financial_documents.is_draft). Kota yenilenince
// buradan tek dokunuşla işlenir; sonuç yine kullanıcı onayına (Kontrol bekliyor) düşer.
// Taslak yokken hiçbir şey çizilmez, mevcut kullanıcıların ana sayfası değişmez.
export function DraftDocumentsQueue({ workspaceId }: { workspaceId: string }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const draftsQuery = useQuery({
    queryKey: queryKeys.dashboardDraftDocuments(workspaceId),
    queryFn: () => listDraftDocuments(workspaceId),
  });

  const usageQuery = useQuery({
    queryKey: queryKeys.ocrUsage(currentPeriodMonth()),
    queryFn: getCurrentOcrUsage,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboardDraftDocuments(workspaceId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboardPendingDocuments(workspaceId) });
  }

  const discardMutation = useMutation({
    mutationFn: (id: string) => discardDocument(id),
    onSuccess: refresh,
  });

  async function process(id: string) {
    if (busyId) return;
    if (usageQuery.data && usageQuery.data.remaining <= 0) {
      Alert.alert(t('scan.quotaFullTitle'), t('scan.quotaFullBody'));
      return;
    }
    const consented = (await AsyncStorage.getItem(OCR_CONSENT_KEY)) === 'true';
    if (!consented) {
      Alert.alert(t('scan.consentTitle'), t('scan.consentText'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('scan.allowAndProcess'),
          onPress: async () => {
            await AsyncStorage.setItem(OCR_CONSENT_KEY, 'true');
            void run(id);
          },
        },
      ]);
      return;
    }
    void run(id);
  }

  async function run(id: string) {
    setBusyId(id);
    try {
      await startProcessing(id);
      // İşleme sunucuda arka planda sürer; bittiğinde belge "Kontrol bekliyor"a düşer.
      refresh();
      setTimeout(refresh, 8000);
      Alert.alert(t('scan.processingTitle'), t('scan.processingBody'));
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        Alert.alert(t('scan.quotaFullTitle'), t('scan.quotaFullBody'));
      } else {
        Alert.alert(t('scan.failedTitle'), friendlyErrorMessage(err, t('scan.failed')));
      }
    } finally {
      setBusyId(null);
    }
  }

  const drafts = draftsQuery.data ?? [];
  if (drafts.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="sectionTitle">{t('scan.drafts.title')}</Text>
      <View style={{ backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.group, overflow: 'hidden' }}>
        {drafts.map((doc, index) => (
          <View
            key={doc.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              minHeight: 64,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderBottomWidth: index === drafts.length - 1 ? 0 : 1,
              borderBottomColor: theme.colors.separator,
            }}
          >
            <Ionicons name="document-outline" size={theme.iconSize.xxl} color={theme.colors.textPrimary} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="cardTitle" numberOfLines={1}>
                {doc.file_name}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {t('scan.drafts.draft', { date: dayMonth.format(new Date(doc.created_at)) })}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('scan.drafts.delete')}
              onPress={() =>
                Alert.alert(t('scan.drafts.delete'), t('scan.drafts.deleteBody'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('common.delete'), style: 'destructive', onPress: () => discardMutation.mutate(doc.id) },
                ])
              }
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="trash-outline" size={20} color={theme.colors.textSecondary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('scan.drafts.process')}
              disabled={busyId !== null}
              onPress={() => process(doc.id)}
              style={{
                minHeight: 44,
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radius.input,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.brandPrimary,
                opacity: busyId === doc.id ? 0.6 : 1,
              }}
            >
              <Text variant="body" style={{ color: theme.colors.onAction, fontWeight: '600' }}>
                {busyId === doc.id ? t('scan.drafts.processing') : t('scan.drafts.processShort')}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
