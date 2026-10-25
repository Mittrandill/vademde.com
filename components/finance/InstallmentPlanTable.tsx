import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Pressable, Tag, Text } from '@/components/primitives';
import { formatMinorAmount } from '@/utils/money';
import { capitalizeUi, localeDateFormatter, unitAccusative, unitForCount } from '@/i18n/format';
import { t } from '@/i18n';

export type InstallmentPlanStatus = 'paid' | 'overdue' | 'upcoming';

export interface InstallmentPlanRow {
  key: string;
  number: number;
  /** yyyy-MM-dd */
  dueDate: string;
  amountMinor: number;
  principalMinor?: number | null;
  status: InstallmentPlanStatus;
}

const dateFormatter = localeDateFormatter({ day: 'numeric', month: 'short', year: 'numeric' });
const COL = 92;

/** Başta görünen ödenmiş taksit sayısı; fazlası tek satırda özetlenir. */
const PAID_PREVIEW = 2;

// Tuval OcrKredi "Taksitler": Vade | Anapara | Taksit sütunlu tek gruplu tablo. Baştaki ödenmiş
// taksitler iki satırdan sonra "… N ödenmiş taksit daha" olarak özetlenir; sıradaki taksit marka
// zeminiyle vurgulanır; kalanlar sayfa sayfa "N taksiti daha göster" ile açılır. Tüm taksitli
// listeler (OCR, kredi detayı, yeni kayıt önizlemesi) bu bileşeni paylaşır.
export function InstallmentPlanTable({
  rows,
  currencyCode,
  unitLabel = t('domain.installmentUnits.installment.unit'),
  pageSize = 6,
  onRowPress,
  rowActionLabel,
}: {
  rows: InstallmentPlanRow[];
  currencyCode: string;
  /** "taksit", "ödeme", "kira" — sayaç ve düğme metinlerinde. */
  unitLabel?: string;
  /** Sıradaki taksitten sonra ilk açılışta gösterilen satır sayısı. */
  pageSize?: number;
  onRowPress?: (row: InstallmentPlanRow) => void;
  /** Ödenmemiş satırların tutarı altında görünen küçük eylem (ör. "Öde"). */
  rowActionLabel?: string;
}) {
  const theme = useTheme();
  const [showAllPaid, setShowAllPaid] = useState(false);
  const [visibleUpcoming, setVisibleUpcoming] = useState(pageSize);
  const showPrincipal = rows.some((r) => r.principalMinor !== null && r.principalMinor !== undefined);

  const firstOpen = rows.findIndex((r) => r.status !== 'paid');
  const paidHead = firstOpen === -1 ? rows : rows.slice(0, firstOpen);
  const rest = firstOpen === -1 ? [] : rows.slice(firstOpen);
  const hiddenPaid = showAllPaid ? 0 : Math.max(0, paidHead.length - PAID_PREVIEW);
  const shownPaid = showAllPaid ? paidHead : paidHead.slice(0, PAID_PREVIEW);
  const shownRest = rest.slice(0, visibleUpcoming);
  const remaining = rest.length - shownRest.length;
  const nextKey = rest[0]?.key ?? null;

  const amountCell = { width: COL, textAlign: 'right' as const, fontSize: 15 };

  const renderRow = (row: InstallmentPlanRow, divider: boolean) => {
    const isNext = row.key === nextKey;
    const paid = row.status === 'paid';
    return (
      <Pressable
        key={row.key}
        accessibilityRole={onRowPress ? 'button' : undefined}
        disabled={!onRowPress}
        onPress={() => onRowPress?.(row)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          minHeight: 54,
          paddingVertical: 8,
          paddingHorizontal: theme.spacing.md,
          borderTopWidth: divider ? 1 : 0,
          borderTopColor: theme.colors.separator,
          backgroundColor: isNext ? withAlpha(theme.colors.brandPrimary, 0.13) : 'transparent',
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text tabular numberOfLines={1} style={{ fontSize: 15, fontWeight: isNext ? '600' : '400', color: paid ? theme.colors.textSecondary : theme.colors.textPrimary }}>
            {row.number} · {dateFormatter.format(new Date(row.dueDate))}
          </Text>
          {paid ? (
            // Satırda yalnızca kısa durum etiketi: uzun açıklama sütunların üstüne taşıyordu;
            // gerekirse tablonun altında tek bir notla anlatılır.
            <Tag tone="success" label={t('finance.plan.paid')} />
          ) : row.status === 'overdue' ? (
            <Tag tone="danger" label={t('finance.plan.overdue')} />
          ) : isNext ? (
            <Text variant="caption" color="textSecondary">
              {t('finance.plan.nextUnit', { unit: unitLabel })}
            </Text>
          ) : null}
        </View>
        {showPrincipal ? (
          <Text tabular numberOfLines={1} style={{ ...amountCell, color: theme.colors.textSecondary }}>
            {row.principalMinor !== null && row.principalMinor !== undefined ? formatMinorAmount(row.principalMinor, currencyCode) : '—'}
          </Text>
        ) : null}
        <View style={{ width: COL, alignItems: 'flex-end', gap: 3 }}>
          <Text tabular numberOfLines={1} style={{ fontSize: 15, fontWeight: isNext ? '700' : '500', color: paid ? theme.colors.textSecondary : theme.colors.textPrimary }}>
            {formatMinorAmount(row.amountMinor, currencyCode)}
          </Text>
          {!paid && rowActionLabel && onRowPress ? (
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.attentionMarker }}>{rowActionLabel}</Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const items: React.ReactNode[] = [];
  shownPaid.forEach((row) => items.push(renderRow(row, items.length > 0)));
  if (hiddenPaid > 0) {
    items.push(
      <Pressable
        key="paid-summary"
        accessibilityRole="button"
        onPress={() => setShowAllPaid(true)}
        style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: theme.colors.separator }}
      >
        <Text variant="caption" color="textSecondary">
          {t('finance.plan.morePaid', { count: hiddenPaid, unit: unitForCount(unitLabel, hiddenPaid) })}
        </Text>
      </Pressable>
    );
  }
  shownRest.forEach((row) => items.push(renderRow(row, items.length > 0)));

  return (
    <View style={{ backgroundColor: theme.colors.surfacePrimary, borderRadius: theme.radius.group, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: theme.spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.separator }}>
        <Text variant="caption" color="textSecondary" style={{ flex: 1, fontWeight: '600' }}>
          {t('finance.plan.due')}
        </Text>
        {showPrincipal ? (
          <Text variant="caption" color="textSecondary" style={{ width: COL, textAlign: 'right', fontWeight: '600' }}>
            {t('finance.plan.principal')}
          </Text>
        ) : null}
        <Text variant="caption" color="textSecondary" style={{ width: COL, textAlign: 'right', fontWeight: '600' }}>
          {capitalizeUi(unitLabel)}
        </Text>
      </View>
      {items}
      {remaining > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setVisibleUpcoming((v) => v + Math.max(pageSize, 12))}
          style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: 1, borderTopColor: theme.colors.separator }}
        >
          <Text style={{ fontSize: 15, fontWeight: '500' }}>
            {t('finance.plan.showMore', { count: remaining, unit: unitAccusative(unitLabel, remaining) })}
          </Text>
          <Ionicons name="chevron-down" size={14} color={theme.colors.textPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}
