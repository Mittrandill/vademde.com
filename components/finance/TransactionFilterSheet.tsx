import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { MAX_FONT_SCALE } from '@/theme/typography';
import { BottomSheet, Button, Group, GroupedRow, Pill, Pressable, Text } from '@/components/primitives';
import { t } from '@/i18n';

export type TypeFilter = 'all' | 'income' | 'expense' | 'payable' | 'receivable' | 'transfer';
export type RangeFilter = 'month' | 'last3';

export interface HareketFilters {
  type: TypeFilter;
  range: RangeFilter;
  accounts: string[];
  categories: string[];
  counterparties: string[];
  /** TL cinsinden, kullanıcının yazdığı metin ("1.250,50"); boşsa sınır yok. */
  minAmount: string;
  maxAmount: string;
}

export const EMPTY_FILTERS: HareketFilters = {
  type: 'all',
  range: 'month',
  accounts: [],
  categories: [],
  counterparties: [],
  minAmount: '',
  maxAmount: '',
};

export function countActiveFilters(f: HareketFilters): number {
  return (
    (f.type !== 'all' ? 1 : 0) +
    (f.range !== 'month' ? 1 : 0) +
    (f.accounts.length ? 1 : 0) +
    (f.categories.length ? 1 : 0) +
    (f.counterparties.length ? 1 : 0) +
    (f.minAmount || f.maxAmount ? 1 : 0)
  );
}

const TYPES: { key: TypeFilter; readonly label: string }[] = [
  { key: 'all', get label() { return t('transactions.filterAll'); } },
  { key: 'expense', get label() { return t('transactions.filterExpense'); } },
  { key: 'income', get label() { return t('transactions.filterIncome'); } },
  { key: 'payable', get label() { return t('transactions.filterPayable'); } },
  { key: 'receivable', get label() { return t('transactions.filterReceivable'); } },
  { key: 'transfer', get label() { return t('common.transfer'); } },
];

type Section = 'accounts' | 'categories' | 'counterparties';

export interface TransactionFilterSheetProps {
  visible: boolean;
  onClose: () => void;
  value: HareketFilters;
  onApply: (value: HareketFilters) => void;
  options: Record<Section, string[]>;
  /** Taslak filtreyle kaç hareketin görüneceği (alttaki düğme etiketi); tür değişince veri yeniden çekileceğinden null. */
  countFor: (value: HareketFilters) => number | null;
}

// Tuval Filtre: Sıfırla / Filtrele / Bitti çubuğu, Tarih segmenti, Tür pill'leri, Daralt grubu, Tutar aralığı ve
// sonuç sayısını gösteren alt düğme. Taslak üzerinde çalışır; "Bitti" ya da alt düğmeyle uygulanır.
export function TransactionFilterSheet(props: TransactionFilterSheetProps) {
  // Yalnızca açıkken mount edilir: taslak her açılışta güncel filtreden başlar (efekt gerekmez).
  return props.visible ? <FilterSheetBody {...props} /> : null;
}

function FilterSheetBody({ visible, onClose, value, onApply, options, countFor }: TransactionFilterSheetProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState<Section | null>(null);

  const toggle = (section: Section, name: string) =>
    setDraft((d) => ({
      ...d,
      [section]: d[section].includes(name) ? d[section].filter((n) => n !== name) : [...d[section], name],
    }));

  const count = countFor(draft);

  const apply = () => {
    onApply(draft);
    onClose();
  };

  const rows: { key: Section; label: string; empty: string }[] = [
    { key: 'accounts', label: t('transactions.filterSheet.account'), empty: t('common.all') },
    { key: 'categories', label: t('transactions.filterSheet.category'), empty: t('common.all') },
    { key: 'counterparties', label: t('transactions.filterSheet.counterparty'), empty: t('common.all') },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 36, marginBottom: theme.spacing.xs }}>
        <Pressable accessibilityRole="button" onPress={() => setDraft({ ...EMPTY_FILTERS })} hitSlop={8}>
          <Text style={{ fontSize: 17 }}>{t('transactions.filterSheet.reset')}</Text>
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600' }}>{t('transactions.filterSheet.title')}</Text>
        <Pressable accessibilityRole="button" onPress={apply} hitSlop={8}>
          <Text style={{ fontSize: 17, fontWeight: '600' }}>{t('transactions.filterSheet.done')}</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
        <SectionLabel>{t('transactions.filterSheet.date')}</SectionLabel>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pill label={t('transactions.filterSheet.thisMonth')} selected={draft.range === 'month'} onPress={() => setDraft((d) => ({ ...d, range: 'month' }))} />
          <Pill label={t('transactions.last3Months')} selected={draft.range === 'last3'} onPress={() => setDraft((d) => ({ ...d, range: 'last3' }))} />
        </View>

        <SectionLabel>{t('transactions.filterSheet.type')}</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TYPES.map((type) => (
            <Pill key={type.key} label={type.label} selected={draft.type === type.key} onPress={() => setDraft((d) => ({ ...d, type: type.key }))} />
          ))}
        </View>

        <SectionLabel>{t('transactions.filterSheet.narrow')}</SectionLabel>
        <Group inset={16} style={{ backgroundColor: theme.colors.backgroundPrimary }}>
          {rows.map((row) => {
            const selected = draft[row.key];
            const list = options[row.key];
            return (
              <View key={row.key}>
                <GroupedRow
                  title={row.label}
                  value={selected.length === 0 ? row.empty : selected.length === 1 ? selected[0] : t('transactions.filterSheet.selectedCount', { count: selected.length })}
                  onPress={() => setOpen(open === row.key ? null : row.key)}
                  chevron={false}
                  trailing={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '60%' }}>
                      <Text color="textSecondary" numberOfLines={1} style={{ flexShrink: 1, fontSize: 15 }}>
                        {selected.length === 0 ? row.empty : selected.length === 1 ? selected[0] : t('transactions.filterSheet.selectedCount', { count: selected.length })}
                      </Text>
                      <Ionicons name={open === row.key ? 'chevron-up' : 'chevron-down'} size={14} color={theme.colors.mutedControl} />
                    </View>
                  }
                />
                {open === row.key ? (
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                    {list.length === 0 ? (
                      <Text color="textSecondary" style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                        {t('transactions.filterSheet.nothingToSelect')}
                      </Text>
                    ) : (
                      list.map((name) => (
                        <Pressable
                          key={name}
                          accessibilityRole="button"
                          accessibilityState={{ selected: selected.includes(name) }}
                          onPress={() => toggle(row.key, name)}
                          style={{ minHeight: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                        >
                          <Text numberOfLines={1} style={{ flex: 1 }}>
                            {name}
                          </Text>
                          {selected.includes(name) ? <Ionicons name="checkmark" size={20} color={theme.colors.brandPrimary} /> : null}
                        </Pressable>
                      ))
                    )}
                  </ScrollView>
                ) : null}
              </View>
            );
          })}
        </Group>

        <SectionLabel>{t('transactions.filterSheet.amount')}</SectionLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AmountBox placeholder={t('transactions.filterSheet.min')} value={draft.minAmount} onChangeText={(v) => setDraft((d) => ({ ...d, minAmount: v }))} />
          <Text color="textSecondary">–</Text>
          <AmountBox placeholder={t('transactions.filterSheet.max')} value={draft.maxAmount} onChangeText={(v) => setDraft((d) => ({ ...d, maxAmount: v }))} />
        </View>
      </ScrollView>

      <View style={{ paddingTop: theme.spacing.md }}>
        <Button label={count === null ? t('transactions.filterSheet.show') : t('transactions.filterSheet.showCount', { count })} onPress={apply} />
      </View>
    </BottomSheet>
  );
}

function SectionLabel({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text variant="label" color="textSecondary" style={{ marginTop: theme.spacing.lg, marginBottom: 10, paddingLeft: theme.spacing.xxs }}>
      {children}
    </Text>
  );
}

function AmountBox({ placeholder, value, onChangeText }: { placeholder: string; value: string; onChangeText: (v: string) => void }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: theme.colors.fill, paddingHorizontal: 14, justifyContent: 'center' }}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        keyboardType="decimal-pad"
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        selectionColor={theme.colors.brandPrimary}
        style={{ fontSize: 17, color: theme.colors.textPrimary, padding: 0 }}
      />
    </View>
  );
}
