import { useMemo } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { EmptyState, Pressable, Text } from '@/components/primitives';
import { Amount } from './Amount';
import { DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import type { ObligationDueItem } from '@/features/obligations/api';
import type { ValueUnitType } from '@/features/valueUnits/units';

export interface UpcomingDueListProps {
  obligations: ObligationDueItem[];
}

// design Main.html "Yaklaşanlar": vadesine göre ilk 5 bekleyen kayıt (gecikmişler başta).
// Eski 7/30 gün sekmeleri ve sayfalandırma kalktı; tam liste "Tümü" ile Vadeli Kayıtlar'da.
const VISIBLE_COUNT = 5;

const DAY_MS = 86_400_000;
const monthFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'short' });

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function UpcomingDueList({ obligations }: UpcomingDueListProps) {
  const theme = useTheme();

  const items = useMemo(() => {
    // Ödenmiş taksitin parent'ı aktif kalabildiği için yalnızca hâlâ bekleyenler gösterilir
    // (bkz. getOverdueObligations'taki aynı kural).
    return obligations
      .filter((o) => o.remaining_amount_minor > 0 && !!o.due_date)
      .sort((a, b) => new Date(a.due_date as string).getTime() - new Date(b.due_date as string).getTime())
      .slice(0, VISIBLE_COUNT);
  }, [obligations]);

  const today = startOfDay(new Date());

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="sectionTitle">Yaklaşanlar</Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/obligations')}
          style={{ minHeight: theme.touchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <Text variant="cardTitle" style={{ fontSize: 14 }}>
            Tümü
          </Text>
          <Ionicons name="chevron-forward" size={theme.iconSize.md} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      {items.length === 0 ? (
        <EmptyState icon="calendar-outline" message="Yaklaşan vadeli kayıt yok." />
      ) : (
        items.map((o, index) => {
          const due = startOfDay(new Date(o.due_date as string));
          const diff = Math.round((due.getTime() - today.getTime()) / DAY_MS);
          const overdue = o.status === 'gecikti' || diff < 0;
          const payable = o.direction === 'payable';

          const tag = overdue
            ? `${Math.max(1, Math.abs(diff))} gün gecikti`
            : diff === 0
              ? 'Bugün'
              : diff === 1
                ? 'Yarın'
                : `${diff} gün`;
          const tagColor = overdue
            ? theme.colors.danger
            : payable
              ? theme.colors.payable
              : theme.colors.receivable;

          return (
            <Pressable
              key={o.installment_id ?? o.id}
              accessibilityRole="button"
              onPress={() => router.push(`/obligations/${o.id}`)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingVertical: 14,
                borderBottomWidth: index === items.length - 1 ? 0 : 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <View style={{ width: 42, alignItems: 'center', gap: 1 }}>
                <Text
                  variant="cardTitle"
                  tabular
                  style={{ fontSize: 20, lineHeight: 24, color: overdue ? theme.colors.danger : theme.colors.textPrimary }}
                >
                  {String(due.getDate()).padStart(2, '0')}
                </Text>
                <Text variant="label" color="textSecondary" style={{ fontSize: 10 }}>
                  {monthFormatter.format(due)}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text variant="cardTitle" numberOfLines={1}>
                  {o.title}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {DOCUMENT_TYPE_LABEL[o.document_type] ?? ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 5 }}>
                <Amount
                  amountMinor={o.remaining_amount_minor}
                  currencyCode={o.currency_code}
                  valueUnitType={o.value_unit_type as ValueUnitType}
                  direction={payable ? 'expense' : 'income'}
                  overdue={overdue}
                  variant="cardTitle"
                />
                <Text variant="label" style={{ textTransform: 'none', fontSize: 11, color: tagColor }}>
                  {tag}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}
    </View>
  );
}
