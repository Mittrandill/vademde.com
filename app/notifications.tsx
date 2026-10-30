import { useState } from 'react';
import { Alert, InteractionManager, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { ActionSheet, EmptyState, Group, GroupedRowIcon, Pagination, Pressable, Skeleton, Stack, Text } from '@/components/primitives';
import type { ActionSheetOption } from '@/components/primitives/ActionSheet';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import {
  countRecentReminders,
  dismissAllReminders,
  dismissReminder,
  listRecentReminders,
  markAllRemindersRead,
  markReminderRead,
  REMINDERS_PAGE_SIZE,
  type DeliveredReminder,
} from '@/features/reminders/api';
import { listSupportReplyNotifications, type SupportReplyNotification } from '@/features/support/api';
import { addObligationToCalendar, createObligationReminder, type CalendarExportObligation } from '@/services/calendarReminders';
import { buildObligationReminderMessage } from '@/utils/reminderMessage';
import { showSuccessAlert, friendlyErrorMessage } from '@/utils/alerts';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { localeDateFormatter } from '@/i18n/format';
import { t } from '@/i18n';

const timeFormatter = localeDateFormatter({ day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// listRecentReminders yalnızca 'delivered' (push'u gerçekten gönderilmiş) satırları döner,
// bunların remind_at'i her zaman bugün ya da geçmiştir.
type SectionKey = 'today' | 'thisWeek' | 'past';

function sectionKeyFor(remindAt: Date, today: Date): SectionKey {
  const diffDays = Math.round((today.getTime() - startOfDay(remindAt).getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'today';
  return diffDays < 7 ? 'thisWeek' : 'past';
}

interface ReminderContent {
  title: string;
  body: string;
  onPress: () => void;
}

function contentFor(reminder: DeliveredReminder): ReminderContent | null {
  if (reminder.kind === 'statement_upload' && reminder.account) {
    return {
      title: t('notifications.statementTitle'),
      body: t('notifications.statementBody', { account: reminder.account.name }),
      onPress: () => router.push(`/accounts/${reminder.account!.id}`),
    };
  }
  if (reminder.kind === 'card_payment_due' && reminder.account) {
    return {
      title: t('notifications.cardDueTitle'),
      body: t('notifications.cardDueBody', {
        account: reminder.account.name,
        when: reminder.stage === 'due_day' ? t('notifications.cardDueToday') : t('notifications.cardDueIn3'),
      }),
      onPress: () => router.push(`/accounts/${reminder.account!.id}`),
    };
  }
  if (reminder.obligation) {
    const message = buildObligationReminderMessage(
      reminder.obligation,
      reminder.obligation.remaining_amount_minor,
      reminder.stage
    );
    return { ...message, onPress: () => router.push(`/obligations/${reminder.obligation!.id}`) };
  }
  return null;
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [page, setPage] = useState(0);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);

  function invalidateReminders() {
    if (!activeWorkspaceId) return;
    InteractionManager.runAfterInteractions(() => {
      queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'reminders'] });
    });
  }

  const countQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.remindersCount(activeWorkspaceId) : ['reminders-count', 'disabled'],
    queryFn: () => countRecentReminders(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
    placeholderData: keepPreviousData,
  });

  const totalCount = countQuery.data ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / REMINDERS_PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages - 1);

  const remindersQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.reminders(activeWorkspaceId, effectivePage) : ['reminders', 'disabled'],
    queryFn: () =>
      listRecentReminders({ workspaceId: activeWorkspaceId as string, page: effectivePage, pageSize: REMINDERS_PAGE_SIZE }),
    enabled: !!activeWorkspaceId,
    placeholderData: keepPreviousData,
  });

  // Destek cevapları çalışma alanına değil kullanıcıya aittir; hatırlatma listesinin üstünde ayrı
  // bir bölümde gösterilir (bkz. supabase/functions/support-reply).
  const supportQuery = useQuery({
    queryKey: queryKeys.supportReplyNotifications(),
    queryFn: () => listSupportReplyNotifications(),
  });
  const supportItems = supportQuery.data ?? [];

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markReminderRead(id),
    onSuccess: invalidateReminders,
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => dismissReminder(id),
    onSuccess: invalidateReminders,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllRemindersRead(activeWorkspaceId as string),
    onSuccess: invalidateReminders,
  });

  const dismissAllMutation = useMutation({
    mutationFn: () => dismissAllReminders(activeWorkspaceId as string),
    onSuccess: invalidateReminders,
  });

  const calendarMutation = useMutation({
    mutationFn: (obligation: CalendarExportObligation) => addObligationToCalendar(obligation),
    onSuccess: () => showSuccessAlert(t('notifications.addedToCalendar'), () => {}),
    onError: (error) => Alert.alert(t('notifications.error'), friendlyErrorMessage(error, t('notifications.calendarFailed'))),
  });

  const reminderMutation = useMutation({
    mutationFn: (obligation: CalendarExportObligation) => createObligationReminder(obligation),
    onSuccess: () => showSuccessAlert(t('notifications.reminderCreated'), () => {}),
    onError: (error) => Alert.alert(t('notifications.error'), friendlyErrorMessage(error, t('notifications.reminderFailed'))),
  });

  function confirmDismissAll() {
    Alert.alert(t('notifications.clearTitle'), t('notifications.clearBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('notifications.clear'), style: 'destructive', onPress: () => dismissAllMutation.mutate() },
    ]);
  }

  const reminders = remindersQuery.data ?? [];
  const today = startOfDay(new Date());
  const groups = new Map<SectionKey, DeliveredReminder[]>();
  for (const reminder of reminders) {
    const key = sectionKeyFor(new Date(reminder.remind_at), today);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(reminder);
  }
  const sections = (['today', 'thisWeek', 'past'] as const)
    .filter((key) => groups.has(key))
    .map((key) => ({ key, title: t(`notifications.${key}`), data: groups.get(key)! }));

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.screenEdge.standard,
          paddingTop: theme.spacing.xxs,
          paddingBottom: theme.spacing.xxl,
          flexGrow: 1,
        }}
      >
        <ScreenHeader
          title={t('notifications.title')}
          rightLabel={{ label: t('notifications.actions'), onPress: () => setBulkMenuOpen(true) }}
        />

        {supportItems.length > 0 ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <Text variant="label" color="textSecondary" style={{ marginBottom: 10 }}>
              {t('notifications.supportSection')}
            </Text>
            <Group inset={62}>
              {supportItems.map((item) => (
                <SupportNotificationRow key={item.id} item={item} />
              ))}
            </Group>
          </View>
        ) : null}

        {remindersQuery.isLoading ? (
          <Stack gap="sm" style={{ paddingTop: theme.spacing.lg }}>
            <Skeleton height={64} borderRadius={theme.radius.group} />
            <Skeleton height={64} borderRadius={theme.radius.group} />
            <Skeleton height={64} borderRadius={theme.radius.group} />
          </Stack>
        ) : sections.length === 0 && remindersQuery.isSuccess && supportItems.length === 0 ? (
          <EmptyState
            icon="notifications-outline"
            title={t('notifications.emptyTitle')}
            message={t('notifications.emptyBody')}
          />
        ) : (
          sections.map((section) => (
            <View key={section.key} style={{ marginTop: theme.spacing.lg }}>
              <Text variant="label" color="textSecondary" style={{ marginBottom: 10 }}>
                {section.title}
              </Text>
              <Group inset={62}>
                {section.data.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    onMarkRead={(id) => markReadMutation.mutate(id)}
                    onDismiss={(id) => dismissMutation.mutate(id)}
                    onAddToCalendar={(obligation) => calendarMutation.mutate(obligation)}
                    onCreateReminder={(obligation) => reminderMutation.mutate(obligation)}
                  />
                ))}
              </Group>
            </View>
          ))
        )}

        {totalPages > 1 ? (
          <View style={{ marginTop: theme.spacing.md }}>
            <Pagination page={effectivePage} totalPages={totalPages} onChange={setPage} loading={remindersQuery.isFetching} />
          </View>
        ) : null}
      </ScrollView>

      <ActionSheet
        visible={bulkMenuOpen}
        title={t('notifications.title')}
        onClose={() => setBulkMenuOpen(false)}
        options={[
          {
            key: 'read-all',
            label: t('notifications.markAllRead'),
            icon: 'checkmark-done-outline',
            onPress: () => markAllReadMutation.mutate(),
          },
          {
            key: 'dismiss-all',
            label: t('notifications.clearAll'),
            icon: 'trash-outline',
            danger: true,
            onPress: confirmDismissAll,
          },
        ]}
      />
    </SafeAreaView>
  );
}

interface NotificationRowProps {
  item: DeliveredReminder;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onAddToCalendar: (obligation: CalendarExportObligation) => void;
  onCreateReminder: (obligation: CalendarExportObligation) => void;
}

function NotificationRow({ item, onMarkRead, onDismiss, onAddToCalendar, onCreateReminder }: NotificationRowProps) {
  const theme = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const content = contentFor(item);
  if (!content) return null;

  const isUnread = !item.read_at;
  const overdue = item.stage === 'overdue_1_day';
  const tone = item.kind === 'statement_upload' || item.kind === 'card_payment_due' ? 'default' : overdue ? 'danger' : item.obligation?.direction === 'receivable' ? 'success' : 'brandSoft';
  const icon = item.kind === 'statement_upload' || item.kind === 'card_payment_due' ? 'card' : overdue ? 'alert-circle' : 'alarm';

  const options: ActionSheetOption[] = [];
  if (item.obligation) {
    options.push({
      key: 'calendar',
      label: t('notifications.addToCalendar'),
      icon: 'calendar-outline',
      onPress: () => onAddToCalendar(item.obligation!),
    });
    if (Platform.OS === 'ios') {
      options.push({
        key: 'reminder',
        label: t('notifications.createReminder'),
        icon: 'alarm-outline',
        onPress: () => onCreateReminder(item.obligation!),
      });
    }
  }
  if (isUnread) {
    options.push({ key: 'read', label: t('notifications.markRead'), icon: 'checkmark-done-outline', onPress: () => onMarkRead(item.id) });
  }
  options.push({ key: 'dismiss', label: t('notifications.dismiss'), icon: 'trash-outline', danger: true, onPress: () => onDismiss(item.id) });

  return (
    <>
      <Pressable
        onPress={() => {
          if (isUnread) onMarkRead(item.id);
          content.onPress();
        }}
        onLongPress={() => setSheetOpen(true)}
        style={{ paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
      >
        <GroupedRowIcon name={icon} tone={tone} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ fontWeight: '600' }}>{content.title}</Text>
          <Text color="textSecondary" style={{ fontSize: 15, lineHeight: 20 }}>
            {content.body}
          </Text>
          <Text variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
            {timeFormatter.format(new Date(item.remind_at))}
          </Text>
          {item.obligation ? (
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (isUnread) onMarkRead(item.id);
                  // Kart ekstresi kişi/firma ödeme ekranından değil, kartın "Kart borcunu öde" akışından ödenir.
                  if (item.obligation!.document_type === 'kredi_karti_ekstresi' && item.obligation!.account_id) {
                    router.push({ pathname: '/accounts/[id]', params: { id: item.obligation!.account_id, pay: '1' } });
                    return;
                  }
                  router.push({
                    pathname: '/payments/new',
                    params: { obligationId: item.obligation!.id, direction: item.obligation!.direction },
                  });
                }}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600' }}>
                  {item.obligation.direction === 'payable' ? t('notifications.markPaid') : t('notifications.markCollected')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/obligations/${item.obligation!.id}`)}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text color="textSecondary" style={{ fontSize: 15 }}>
                  {t('notifications.check')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        {isUnread ? (
          <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: theme.colors.brandPrimary }} />
        ) : null}
      </Pressable>

      <ActionSheet visible={sheetOpen} title={content.title} onClose={() => setSheetOpen(false)} options={options} />
    </>
  );
}

// Destek cevabı satırı: dokununca sohbet açılır, sohbet ekranı cevapları okundu işaretler.
function SupportNotificationRow({ item }: { item: SupportReplyNotification }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push(`/destek/${item.messageId}`)}
      style={{ paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
    >
      <GroupedRowIcon name="chatbubbles" tone="brandSoft" />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ fontWeight: '600' }}>{t('notifications.supportReplyTitle')}</Text>
        <Text color="textSecondary" numberOfLines={1} style={{ fontSize: 15, lineHeight: 20 }}>
          {item.subject}
        </Text>
        <Text color="textSecondary" numberOfLines={2} style={{ fontSize: 15, lineHeight: 20 }}>
          {item.body.replace(/s+/g, ' ').trim()}
        </Text>
        <Text variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
          {timeFormatter.format(new Date(item.createdAt))}
        </Text>
      </View>
      {!item.read ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: theme.colors.brandPrimary }} />
      ) : null}
    </Pressable>
  );
}
