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
import { addObligationToCalendar, createObligationReminder, type CalendarExportObligation } from '@/services/calendarReminders';
import { buildObligationReminderMessage } from '@/utils/reminderMessage';
import { showSuccessAlert } from '@/utils/alerts';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';

const timeFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// listRecentReminders yalnızca 'delivered' (push'u gerçekten gönderilmiş) satırları döner,
// bunların remind_at'i her zaman bugün ya da geçmiştir.
function sectionTitleFor(remindAt: Date, today: Date): string {
  const diffDays = Math.round((today.getTime() - startOfDay(remindAt).getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'BUGÜN';
  return diffDays < 7 ? 'BU HAFTA' : 'GEÇMİŞ';
}

interface ReminderContent {
  title: string;
  body: string;
  onPress: () => void;
}

function contentFor(reminder: DeliveredReminder): ReminderContent | null {
  if (reminder.kind === 'statement_upload' && reminder.account) {
    return {
      title: 'Ekstre yüklemeyi unutmayın',
      body: `${reminder.account.name} — bu ayki ekstrenizi tarayın veya kart borcunu elle girin.`,
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
    onSuccess: () => showSuccessAlert('Takvime eklendi.', () => {}),
    onError: (error) => Alert.alert('Hata', error instanceof Error ? error.message : 'Takvime eklenemedi'),
  });

  const reminderMutation = useMutation({
    mutationFn: (obligation: CalendarExportObligation) => createObligationReminder(obligation),
    onSuccess: () => showSuccessAlert('Hatırlatıcı oluşturuldu.', () => {}),
    onError: (error) => Alert.alert('Hata', error instanceof Error ? error.message : 'Hatırlatıcı oluşturulamadı'),
  });

  function confirmDismissAll() {
    Alert.alert('Bildirimleri Temizle', 'Bu sayfadaki değil, tüm bekleyen bildirimler gelen kutusundan temizlenecek. Vadeleri hatırlatan gerçek bildirimler yine planlı kalır. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Temizle', style: 'destructive', onPress: () => dismissAllMutation.mutate() },
    ]);
  }

  const reminders = remindersQuery.data ?? [];
  const today = startOfDay(new Date());
  const groups = new Map<string, DeliveredReminder[]>();
  for (const reminder of reminders) {
    const title = sectionTitleFor(new Date(reminder.remind_at), today);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title)!.push(reminder);
  }
  const sections = ['BUGÜN', 'BU HAFTA', 'GEÇMİŞ']
    .filter((title) => groups.has(title))
    .map((title) => ({ title, data: groups.get(title)! }));

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
          title="Bildirimler"
          rightLabel={{ label: 'İşlemler', onPress: () => setBulkMenuOpen(true) }}
        />

        {remindersQuery.isLoading ? (
          <Stack gap="sm" style={{ paddingTop: theme.spacing.lg }}>
            <Skeleton height={64} borderRadius={theme.radius.group} />
            <Skeleton height={64} borderRadius={theme.radius.group} />
            <Skeleton height={64} borderRadius={theme.radius.group} />
          </Stack>
        ) : sections.length === 0 && remindersQuery.isSuccess ? (
          <EmptyState
            icon="notifications-outline"
            title="Henüz bildirim yok"
            message="Bir hatırlatma gönderildiğinde burada görünecek."
          />
        ) : (
          sections.map((section) => (
            <View key={section.title} style={{ marginTop: theme.spacing.lg }}>
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
        title="Bildirimler"
        onClose={() => setBulkMenuOpen(false)}
        options={[
          {
            key: 'read-all',
            label: 'Tümünü Okundu İşaretle',
            icon: 'checkmark-done-outline',
            onPress: () => markAllReadMutation.mutate(),
          },
          {
            key: 'dismiss-all',
            label: 'Tümünü Temizle',
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
  const tone = item.kind === 'statement_upload' ? 'default' : overdue ? 'danger' : item.obligation?.direction === 'receivable' ? 'success' : 'brandSoft';
  const icon = item.kind === 'statement_upload' ? 'card' : overdue ? 'alert-circle' : 'alarm';

  const options: ActionSheetOption[] = [];
  if (item.obligation) {
    options.push({
      key: 'calendar',
      label: 'Takvime Ekle',
      icon: 'calendar-outline',
      onPress: () => onAddToCalendar(item.obligation!),
    });
    if (Platform.OS === 'ios') {
      options.push({
        key: 'reminder',
        label: 'Hatırlatıcı Oluştur',
        icon: 'alarm-outline',
        onPress: () => onCreateReminder(item.obligation!),
      });
    }
  }
  if (isUnread) {
    options.push({ key: 'read', label: 'Okundu İşaretle', icon: 'checkmark-done-outline', onPress: () => onMarkRead(item.id) });
  }
  options.push({ key: 'dismiss', label: 'Bildirimi Temizle', icon: 'trash-outline', danger: true, onPress: () => onDismiss(item.id) });

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
                  {item.obligation.direction === 'payable' ? 'Ödendi işaretle' : 'Tahsil edildi işaretle'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/obligations/${item.obligation!.id}`)}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text color="textSecondary" style={{ fontSize: 15 }}>
                  Kontrol et
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
