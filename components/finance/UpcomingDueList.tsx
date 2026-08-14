import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Card, Divider, EmptyState, Pagination, Pressable, Row, SectionHeader, SegmentedControl, Stack, Text } from '@/components/primitives';
import { StatusBadge } from './StatusBadge';
import { Amount } from './Amount';
import { DateBlock } from './DateBlock';
import { ObligationIcon } from './ObligationIcon';
import type { ObligationDueItem } from '@/features/obligations/api';
import type { ValueUnitType } from '@/features/valueUnits/units';

export interface UpcomingDueListProps {
  obligations: ObligationDueItem[];
}

type SegmentKey = 'today' | 'week' | 'month' | 'overdue';

const SEGMENTS: { key: SegmentKey; label: string; days: number }[] = [
  { key: 'today', label: 'Bugün', days: 0 },
  { key: 'week', label: '7 Gün', days: 7 },
  { key: 'month', label: '30 Gün', days: 30 },
  { key: 'overdue', label: 'Gecikmiş', days: 0 },
];

// Hareketler sekmesindeki listeyle aynı sayfa boyutu (bkz. RecentTransactionsList/
// hareketler.tsx) — 10'dan fazla kayıt olduğunda sayfalandırma devreye girer.
const PAGE_SIZE = 10;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

export function UpcomingDueList({ obligations }: UpcomingDueListProps) {
  const [segment, setSegment] = useState<SegmentKey>('week');
  const [page, setPage] = useState(0);
  const [lastSegment, setLastSegment] = useState(segment);

  const filtered = useMemo(() => {
    const today = startOfDay(new Date());
    // Taksitli/abonelik kayıtlarda geçmiş bir taksit zaten ödenmiş olabilir (remaining 0) —
    // parent obligation hâlâ aktif statüde kaldığı için (gelecekteki taksitler yüzünden)
    // bu satır sorgudan düşmüyordu, yalnızca tarihe bakan filtre de bunu elemiyordu; ödenmiş
    // bir taksit süresiz olarak "Gecikmiş" sekmesinde kalıyordu. Widget'ın tüm sekmeleri
    // yalnızca HÂLÂ bekleyen kayıtları göstermeli — bkz. getOverdueObligations'taki aynı kural.
    const pending = obligations.filter((o) => o.remaining_amount_minor > 0);

    // "Gecikmiş" ayrı bir sekme: vadesi bugünden önce olan kayıtlar artık Bugün/7
    // Gün/30 Gün sekmelerine karışmıyor, sadece bu sekmede görünüyor.
    if (segment === 'overdue') {
      return pending.filter((o) => {
        if (!o.due_date) return false;
        return startOfDay(new Date(o.due_date)) < today;
      });
    }

    const days = SEGMENTS.find((s) => s.key === segment)?.days ?? 7;
    const limit = new Date(today);
    limit.setDate(limit.getDate() + days);

    return pending.filter((o) => {
      if (!o.due_date) return false;
      const due = startOfDay(new Date(o.due_date));
      return due >= today && due <= limit;
    });
  }, [obligations, segment]);

  // Sekme değişince önceki sayfa anlamsızlaşır — hareketler.tsx'teki aynı desen: render
  // sırasında (ekstra render turu olmadan) 1. sayfaya dönülür.
  if (segment !== lastSegment) {
    setLastSegment(segment);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages - 1);
  const visible = filtered.slice(effectivePage * PAGE_SIZE, effectivePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <Stack gap="sm">
      <SectionHeader title="Yaklaşan Vadeler" />

      <SegmentedControl
        options={SEGMENTS}
        value={segment}
        onChange={setSegment}
        size="compact"
        scrollable
      />

      {filtered.length === 0 ? (
        <EmptyState icon="calendar-outline" message="Bu aralıkta vadesi gelen kayıt yok." />
      ) : (
        <Stack gap="sm">
          {/* Son Hareketler ile aynı desen: tek arka plan üzerinde satır araları çizgiyle
              ayrılır, her satır ayrı bir kart olmaz (bkz. RecentTransactionsList). */}
          <Card style={{ padding: 0 }}>
            {visible.map((o, index) => (
              <UpcomingDueRow key={o.installment_id ?? o.id} obligation={o} isLast={index === visible.length - 1} />
            ))}
          </Card>
          <Pagination page={effectivePage} totalPages={totalPages} onChange={setPage} />
        </Stack>
      )}
    </Stack>
  );
}

function UpcomingDueRow({ obligation: o, isLast }: { obligation: ObligationDueItem; isLast: boolean }) {
  const theme = useTheme();

  return (
    <View>
      <Pressable
        onPress={() => router.push(`/obligations/${o.id}`)}
        style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm }}
      >
        <Row gap="sm" align="center">
          <DateBlock date={o.due_date ?? new Date()} />
          <ObligationIcon
            documentType={o.document_type}
            bankCode={o.bank_code}
            serviceCode={o.service_code}
            fallbackName={o.title}
            size={36}
          />
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle" numberOfLines={1}>
              {o.title}
            </Text>
            <Row gap="xs" align="center">
              <Text variant="caption" color="textSecondary">
                {o.due_date ? dateFormatter.format(new Date(o.due_date)) : ''}
              </Text>
              <StatusBadge status={o.status} />
            </Row>
          </Stack>
          <Amount
            amountMinor={o.remaining_amount_minor}
            currencyCode={o.currency_code}
            valueUnitType={o.value_unit_type as ValueUnitType}
            direction={o.direction as 'payable' | 'receivable'}
            overdue={o.status === 'gecikti'}
            variant="body"
          />
        </Row>
      </Pressable>
      {!isLast ? <Divider style={{ marginHorizontal: theme.spacing.md }} /> : null}
    </View>
  );
}
