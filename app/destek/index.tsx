import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { EmptyState, Group, GroupedRow, GroupedRowIcon, ListError, ListSkeleton, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { listSupportThreads, type SupportThreadSummary } from '@/features/support/api';
import { queryKeys } from '@/services/queryKeys';
import { friendlyErrorMessage } from '@/utils/alerts';
import { localeDateFormatter } from '@/i18n/format';
import { t } from '@/i18n';

const dayMonth = localeDateFormatter({ day: 'numeric', month: 'short' });

// Destek talepleri: uygulamadan açılanlar ve hesabın doğrulanmış e-postasıyla web formundan
// gönderilenler. Sıralama son hareket (son cevap) tarihine göredir.
export default function SupportListScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const threadsQuery = useQuery({ queryKey: queryKeys.supportThreads(), queryFn: listSupportThreads });
  const threads = threadsQuery.data ?? [];

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{ padding: theme.screenEdge.standard, gap: theme.spacing.lg, paddingBottom: theme.spacing.massive }}
      >
        <ScreenHeader
          title={t('support.title')}
          right={{
            icon: 'add',
            accessibilityLabel: t('support.newRequest'),
            variant: 'accent',
            onPress: () => router.push('/destek/new'),
          }}
        />

        {threadsQuery.isLoading ? (
          <ListSkeleton rows={3} />
        ) : threadsQuery.error ? (
          <ListError
            message={friendlyErrorMessage(threadsQuery.error, t('support.loadFailed'))}
            onRetry={() => void threadsQuery.refetch()}
          />
        ) : threads.length === 0 ? (
          <EmptyState
            icon="chatbubbles-outline"
            title={t('support.emptyTitle')}
            message={t('support.emptyBody')}
            actionLabel={t('support.newRequest')}
            onActionPress={() => router.push('/destek/new')}
          />
        ) : (
          <Group>
            {threads.map((thread) => (
              <ThreadRow key={thread.id} thread={thread} />
            ))}
          </Group>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ThreadRow({ thread }: { thread: SupportThreadSummary }) {
  const theme = useTheme();
  const preview = thread.lastPreview.replace(/\s+/g, ' ').trim();
  return (
    <GroupedRow
      leading={<GroupedRowIcon name="chatbubble-ellipses" />}
      title={thread.subject}
      subtitle={preview}
      onPress={() => router.push(`/destek/${thread.id}`)}
      trailing={
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text variant="caption" color="textSecondary">
            {dayMonth.format(new Date(thread.lastActivityAt))}
          </Text>
          {thread.unread > 0 ? (
            <Text variant="caption" style={{ color: theme.colors.payable, fontWeight: '600' }}>
              {t('support.newReply')}
            </Text>
          ) : null}
        </View>
      }
    />
  );
}
