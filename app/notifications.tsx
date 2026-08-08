import { useState } from 'react';
import { Alert, InteractionManager, Platform, SectionList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { ActionSheet, Card, EmptyState, Pagination, Pressable, Row, Skeleton, Stack, Text } from '@/components/primitives';
import type { ActionSheetOption } from '@/components/primitives/ActionSheet';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { BankLogo } from '@/components/finance/BankLogo';
import {
  countUpcomingReminders,
  dismissAllReminders,
  dismissReminder,
  listUpcomingReminders,
  markAllRemindersRead,
  markReminderRead,
  REMINDERS_PAGE_SIZE,
  type UpcomingReminder,
} from '@/features/reminders/api';
import { addObligationToCalendar, createObligationReminder, type CalendarExportObligation } from '@/services/calendarReminders';
import { formatMinorAmount } from '@/utils/money';
import { showSuccessAlert } from '@/utils/alerts';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';

// services/notifications.ts REMINDER_STAGES ile aynı önek/etiket — burada gösterilen
// metin, cihaza planlanan gerçek OS bildiriminin başlığıyla birebir eşleşir.
const STAGE_PREFIX: Record<string, string> = {
  '7_days_before': '7 gün kaldı — ',
  '3_days_before': '3 gün kaldı — ',
  due_day: '',
};

const timeFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sectionTitleFor(remindAt: Date, today: Date): string {
  const diffDays = Math.round((startOfDay(remindAt).getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'BUGÜN';
  if (diffDays === 1) return 'YARIN';
  if (diffDays > 1 && diffDays < 7) return 'BU HAFTA';
  return 'DAHA SONRA';
}

interface ReminderContent {
  title: string;
  body: string;
  onPress: () => void;
}

function contentFor(reminder: UpcomingReminder): ReminderContent | null {
  if (reminder.kind === 'statement_upload' && reminder.account) {
    return {
      title: 'Ekstre yüklemeyi unutmayın',
      body: `${reminder.account.name} — bu ayki ekstrenizi tarayın veya kart borcunu elle girin.`,
      onPress: () => router.push(`/accounts/${reminder.account!.id}`),
    };
  }
  if (reminder.obligation) {
    const label = reminder.obligation.direction === 'payable' ? 'Ödeme vadesi' : 'Tahsilat vadesi';
    return {
      title: `${STAGE_PREFIX[reminder.stage] ?? ''}${label}`,
      body: `${reminder.obligation.title} — ${formatMinorAmount(reminder.obligation.remaining_amount_minor, reminder.obligation.currency_code)}`,
      onPress: () => router.push(`/obligations/${reminder.obligation!.id}`),
    };
  }
  return null;
}

export default function NotificationsScreen() {
  const theme = useTheme();
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
    queryFn: () => countUpcomingReminders(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
    placeholderData: keepPreviousData,
  });

  const totalCount = countQuery.data ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / REMINDERS_PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages - 1);

  const remindersQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.reminders(activeWorkspaceId, effectivePage) : ['reminders', 'disabled'],
    queryFn: () =>
      listUpcomingReminders({ workspaceId: activeWorkspaceId as string, page: effectivePage, pageSize: REMINDERS_PAGE_SIZE }),
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
  const groups = new Map<string, UpcomingReminder[]>();
  for (const reminder of reminders) {
    const title = sectionTitleFor(new Date(reminder.remind_at), today);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title)!.push(reminder);
  }
  const sections = ['BUGÜN', 'YARIN', 'BU HAFTA', 'DAHA SONRA']
    .filter((title) => groups.has(title))
    .map((title) => ({ title, data: groups.get(title)! }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Stack gap="lg" style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.md }}>
        <ScreenHeader
          title="Bildirimler"
          right={{
            icon: 'ellipsis-horizontal',
            accessibilityLabel: 'Diğer işlemler',
            onPress: () => setBulkMenuOpen(true),
          }}
        />
      </Stack>

      {remindersQuery.isLoading ? (
        <Stack gap="sm" style={{ padding: theme.screenEdge.standard }}>
          <Skeleton height={64} borderRadius={theme.radius.widget} />
          <Skeleton height={64} borderRadius={theme.radius.widget} />
          <Skeleton height={64} borderRadius={theme.radius.widget} />
        </Stack>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: theme.screenEdge.standard,
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.xxl,
            flexGrow: 1,
          }}
          renderSectionHeader={({ section }) => (
            <Text
              variant="caption"
              color="textSecondary"
              style={{ backgroundColor: theme.colors.backgroundPrimary, paddingVertical: theme.spacing.sm }}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <NotificationRow
              item={item}
              onMarkRead={(id) => markReadMutation.mutate(id)}
              onDismiss={(id) => dismissMutation.mutate(id)}
              onAddToCalendar={(obligation) => calendarMutation.mutate(obligation)}
              onCreateReminder={(obligation) => reminderMutation.mutate(obligation)}
            />
          )}
          ListFooterComponent={
            totalPages > 1 ? (
              <Pagination
                page={effectivePage}
                totalPages={totalPages}
                onChange={setPage}
                loading={remindersQuery.isFetching}
              />
            ) : null
          }
          ListEmptyComponent={
            remindersQuery.isSuccess ? (
              <EmptyState
                icon="notifications-outline"
                title="Henüz bildirim yok"
                message="Vadesi yaklaşan bir kayıt olduğunda burada görünecek."
              />
            ) : null
          }
        />
      )}

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
  item: UpcomingReminder;
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
    options.push({
      key: 'read',
      label: 'Okundu İşaretle',
      icon: 'checkmark-done-outline',
      onPress: () => onMarkRead(item.id),
    });
  }
  options.push({
    key: 'dismiss',
    label: 'Bildirimi Temizle',
    icon: 'trash-outline',
    danger: true,
    onPress: () => onDismiss(item.id),
  });

  return (
    <>
      <Pressable
        onPress={() => {
          if (isUnread) onMarkRead(item.id);
          content.onPress();
        }}
      >
        <Card style={{ marginBottom: theme.spacing.sm, opacity: isUnread ? 1 : 0.65 }}>
          <Row gap="sm" align="flex-start">
            {item.kind === 'statement_upload' ? (
              <BankLogo bankCode={item.account?.bank_code} fallbackName={item.account?.name} size={36} />
            ) : (
              <ObligationIcon
                documentType={item.obligation?.document_type ?? 'diger'}
                bankCode={item.obligation?.bank_code}
                serviceCode={item.obligation?.service_code}
                fallbackName={item.obligation?.title}
                size={36}
              />
            )}
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Row gap="xs" align="center">
                {isUnread ? (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.brandPrimary }} />
                ) : null}
                <Text variant="cardTitle" style={{ flex: 1 }}>
                  {content.title}
                </Text>
              </Row>
              <Text variant="body" color="textSecondary">
                {content.body}
              </Text>
            </Stack>
            <Stack gap="xs" align="flex-end">
              <Text variant="caption" color="textSecondary">
                {timeFormatter.format(new Date(item.remind_at))}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Diğer işlemler" onPress={() => setSheetOpen(true)} hitSlop={10}>
                <Ionicons name="ellipsis-vertical" size={18} color={theme.colors.textSecondary} />
              </Pressable>
            </Stack>
          </Row>
        </Card>
      </Pressable>

      <ActionSheet visible={sheetOpen} title={content.title} onClose={() => setSheetOpen(false)} options={options} />
    </>
  );
}
