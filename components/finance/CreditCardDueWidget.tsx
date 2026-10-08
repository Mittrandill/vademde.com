import { useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Pressable, SectionHeader, Tag, Text } from '@/components/primitives';
import { BankLogo } from './BankLogo';
import type { ObligationDueItem } from '@/features/obligations/api';
import { BANK_NAME } from '@/features/banks/banks';
import { formatMinorAmount } from '@/utils/money';

export interface CreditCardDueWidgetProps {
  obligations: ObligationDueItem[];
}

const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
const GAP = 12;
const EDGE = 20;

function daysUntil(dueDate: string): number {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = new Date(dueDate);
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((dueStart.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

// Tuval AnaSayfa "Kredi kartları": kartlar yatay kaydırılır (bir bakışta bir kart, yanındakinin ucu görünür);
// her kart standart yüzey kartı: banka logosu, kalan gün, dönem borcu, son ödeme.
export function CreditCardDueWidget({ obligations }: CreditCardDueWidgetProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  if (obligations.length === 0) return null;

  const cardWidth = obligations.length > 1 ? width - EDGE * 2 - 28 : width - EDGE * 2;
  const step = cardWidth + GAP;

  return (
    <View>
      <SectionHeader title="Kredi kartları" actionLabel="Tümü" onActionPress={() => router.push('/accounts/credit-cards')} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        contentContainerStyle={{ gap: GAP, paddingHorizontal: EDGE }}
        style={{ marginHorizontal: -EDGE }}
        onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / step))}
        scrollEventThrottle={64}
      >
        {obligations.map((o) => (
          <CardTile key={o.id} item={o} width={cardWidth} />
        ))}
      </ScrollView>
      {obligations.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 }}>
          {obligations.map((o, i) => (
            <View
              key={o.id}
              style={{
                width: i === page ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === page ? theme.colors.brandPrimary : theme.colors.separator,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CardTile({ item, width }: { item: ObligationDueItem; width: number }) {
  const theme = useTheme();
  const remaining = item.due_date ? daysUntil(item.due_date) : null;
  const overdue = remaining !== null && remaining < 0;
  const label = remaining === null ? null : overdue ? `${Math.abs(remaining)} gün gecikti` : remaining === 0 ? 'Bugün' : `${remaining} gün`;
  const bankName = (item.bank_code && BANK_NAME[item.bank_code]) || null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/obligations/${item.id}`)}
      style={{
        width,
        borderRadius: theme.radius.widget,
        padding: 16,
        gap: 16,
        backgroundColor: theme.colors.surfacePrimary,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BankLogo bankCode={item.bank_code} fallbackName={bankName ?? item.title} size={34} fallbackIcon="card-outline" />
        <Text numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>
          {bankName ?? item.title}
        </Text>
        {label ? <Tag tone={overdue ? 'danger' : remaining !== null && remaining <= 3 ? 'brand' : 'neutral'} label={label} /> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <Text variant="caption" color="textSecondary">
            Dönem borcu
          </Text>
          <Text tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 24, lineHeight: 29, fontWeight: '700' }}>
            {formatMinorAmount(item.remaining_amount_minor, item.currency_code)}
          </Text>
        </View>
        {item.due_date ? (
          <View style={{ gap: 2, alignItems: 'flex-end' }}>
            <Text variant="caption" color="textSecondary">
              Son ödeme
            </Text>
            <Text style={{ fontWeight: '600' }}>{dayMonth.format(new Date(item.due_date))}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
