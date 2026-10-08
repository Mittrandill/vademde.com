import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { DatePickerSheet, Group, Pressable, SectionHeader, SegmentedControl, SwipeableRow, Text } from '@/components/primitives';
import { DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import { updateObligation, type ObligationDueItem } from '@/features/obligations/api';
import { syncObligationReminder } from '@/services/notifications';
import { invalidatePaymentRelatedQueries } from '@/services/queryKeys';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { showErrorAlert } from '@/utils/alerts';
import { formatMinorAmount, formatValueUnitAmount } from '@/utils/money';

export interface UpcomingDueListProps {
  obligations: ObligationDueItem[];
}

type Range = 'today' | '7' | '30';

const RANGES: { key: Range; label: string; days: number }[] = [
  { key: 'today', label: 'Bugün', days: 0 },
  { key: '7', label: '7 gün', days: 7 },
  { key: '30', label: '30 gün', days: 30 },
];

const VISIBLE_COUNT = 5;
const DAY_MS = 86_400_000;
const monthFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'short' });

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Tuval AnaSayfa "Yaklaşan vadeler": Bugün / 7 gün / 30 gün segmenti ve tarih bloklu gruplu liste.
// Her aralık yalnızca kendi penceresindeki vadeleri gösterir (Bugün = bugün, 7/30 gün = bugünden itibaren);
// gecikmişler üstteki gecikmiş kartında ve Tüm Kayıtlar > Gecikmiş sekmesinde.
export function UpcomingDueList({ obligations }: UpcomingDueListProps) {
  const theme = useTheme();
  const [range, setRange] = useState<Range>('7');
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  // Sağa kaydır → Ertele: vadeyi seçilen yeni tarihe taşır (yalnızca taksitsiz kayıtlarda; taksitli
  // kayıtta tek taksidin tarihi kaydın kendi detayından değiştirilir).
  const [postponing, setPostponing] = useState<ObligationDueItem | null>(null);

  async function postpone(item: ObligationDueItem, dueDate: string) {
    try {
      const updated = await updateObligation(item.id, { due_date: dueDate });
      if (activeWorkspaceId) {
        await syncObligationReminder(activeWorkspaceId, updated);
        invalidatePaymentRelatedQueries(queryClient, activeWorkspaceId);
      }
    } catch (error) {
      showErrorAlert(error);
    }
  }
  const today = startOfDay(new Date());
  const days = RANGES.find((r) => r.key === range)?.days ?? 7;

  const { items, total } = useMemo(() => {
    const open = obligations
      .filter((o) => o.remaining_amount_minor > 0 && !!o.due_date)
      .filter((o) => {
        const diff = Math.round((startOfDay(new Date(o.due_date as string)).getTime() - today.getTime()) / DAY_MS);
        return diff >= 0 && diff <= days;
      })
      .sort((a, b) => new Date(a.due_date as string).getTime() - new Date(b.due_date as string).getTime());
    return { items: open.slice(0, VISIBLE_COUNT), total: open.length };
  }, [obligations, days, today]);

  return (
    <View>
      <SectionHeader title="Yaklaşan vadeler" actionLabel="Takvim" onActionPress={() => router.push('/(tabs)/takvim')} />
      <SegmentedControl options={RANGES.map(({ key, label }) => ({ key, label }))} value={range} onChange={setRange} />

      <View style={{ marginTop: theme.spacing.sm }}>
        {items.length === 0 ? (
          <Group inset={16}>
            <View style={{ minHeight: 56, justifyContent: 'center', paddingHorizontal: 16 }}>
              <Text color="textSecondary">Bu aralıkta vade yok.</Text>
            </View>
          </Group>
        ) : (
          <Group inset={62}>
            {items.map((o) => (
              <SwipeableRow
                key={o.installment_id ?? o.id}
                leftActions={[
                  {
                    key: 'paid',
                    label: o.direction === 'receivable' ? 'Tahsil' : 'Ödendi',
                    icon: 'checkmark',
                    backgroundColor: theme.colors.receivable,
                    color: theme.colors.onAction,
                    onPress: () =>
                      router.push({
                        pathname: '/obligations/[id]',
                        params: { id: o.id, pay: '1', ...(o.installment_id ? { installmentId: o.installment_id } : {}) },
                      }),
                  },
                  ...(o.installment_id
                    ? []
                    : [
                        {
                          key: 'postpone',
                          label: 'Ertele',
                          icon: 'calendar' as const,
                          backgroundColor: theme.colors.brandPrimary,
                          color: theme.colors.onAction,
                          onPress: () => setPostponing(o),
                        },
                      ]),
                ]}
              >
                <DueRow item={o} today={today} />
              </SwipeableRow>
            ))}
            {total > items.length ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/obligations')}
                style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '500' }}>Tüm vadeli kayıtlar</Text>
                <Ionicons name="chevron-forward" size={12} color={theme.colors.textPrimary} />
              </Pressable>
            ) : null}
          </Group>
        )}
      </View>

      <DatePickerSheet
        visible={!!postponing}
        onClose={() => setPostponing(null)}
        value={postponing?.due_date ?? null}
        title="Vadeyi ertele"
        onChange={(iso) => {
          const item = postponing;
          setPostponing(null);
          if (item && iso !== item.due_date) void postpone(item, iso);
        }}
      />
    </View>
  );
}

function DueRow({ item: o, today }: { item: ObligationDueItem; today: Date }) {
  const theme = useTheme();
  const due = startOfDay(new Date(o.due_date as string));
  const diff = Math.round((due.getTime() - today.getTime()) / DAY_MS);
  const overdue = o.status === 'gecikti' || diff < 0;
  const receivable = o.direction === 'receivable';
  const relative = overdue
    ? `${Math.max(1, Math.abs(diff))} gün gecikti`
    : diff === 0
      ? 'Bugün'
      : diff === 1
        ? 'Yarın'
        : `${diff} gün`;
  const amountText =
    o.value_unit_type === 'kiymetli_maden'
      ? formatValueUnitAmount(o.remaining_amount_minor, o.currency_code)
      : formatMinorAmount(o.remaining_amount_minor, o.currency_code);
  const dateColor = overdue ? theme.colors.danger : theme.colors.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/obligations/${o.id}`)}
      style={{ backgroundColor: theme.colors.surfacePrimary, minHeight: 56, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View style={{ width: 34, alignItems: 'center' }}>
        <Text tabular style={{ fontSize: 18, lineHeight: 20, fontWeight: '700', color: dateColor }}>
          {String(due.getDate()).padStart(2, '0')}
        </Text>
        <Text style={{ fontSize: 11, fontWeight: '600', color: overdue ? theme.colors.danger : theme.colors.textSecondary }}>
          {monthFormatter.format(due).toLocaleUpperCase('tr-TR')}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontWeight: '500' }}>
          {o.counterparty?.name || o.title}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {DOCUMENT_TYPE_LABEL[o.document_type] ?? 'Kayıt'} · {relative}
        </Text>
      </View>
      <Text tabular style={{ fontWeight: '600', color: receivable ? theme.colors.receivable : theme.colors.textPrimary }}>
        {receivable ? '+' : ''}
        {amountText}
      </Text>
    </Pressable>
  );
}
