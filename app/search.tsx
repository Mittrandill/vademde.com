import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { MAX_FONT_SCALE } from '@/theme/typography';
import { useReflowKey } from '@/services/reflow';
import { EmptyState, Group, GroupedRow, GroupedRowAvatar, Pill, Pressable, Skeleton, Text } from '@/components/primitives';
import { ObligationIcon } from '@/components/finance/ObligationIcon';
import { listCounterparties, getCounterpartyTypeLabel } from '@/features/counterparties/api';
import { listTransactions } from '@/features/transactions/api';
import { listObligations } from '@/features/obligations/api';
import { DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import { queryKeys } from '@/services/queryKeys';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount, formatValueUnitAmount } from '@/utils/money';
import { matchesSearch, normalizeForSearch } from '@/utils/search';

type Scope = 'all' | 'counterparties' | 'transactions' | 'obligations';

const RESULT_LIMIT = 30;
const PREVIEW_COUNT = 3;
const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toLocaleUpperCase('tr-TR');
}

// Tuval Arama: üstte arama alanı + Vazgeç, sonuç türü pill'leri, Cari / Hareketler / Kayıtlar bölümleri.
// "Belge içinde" (OCR metni) araması sunucu tarafı gerektirdiği için henüz yok.
export default function SearchScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [input, setInput] = useState(typeof q === 'string' ? q : '');
  const [query, setQuery] = useState(typeof q === 'string' ? q.trim() : '');
  const [scope, setScope] = useState<Scope>('all');

  useEffect(() => {
    const timeout = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(timeout);
  }, [input]);

  const active = !!workspaceId && query.length >= 2;

  const counterpartiesQuery = useQuery({
    queryKey: workspaceId ? queryKeys.counterparties(workspaceId) : ['counterparties', 'disabled'],
    queryFn: () => listCounterparties(workspaceId as string),
    enabled: !!workspaceId,
  });
  const transactionsQuery = useQuery({
    queryKey: [workspaceId, 'search', 'transactions', query],
    queryFn: () => listTransactions({ workspaceId: workspaceId as string, search: query, pageSize: RESULT_LIMIT }),
    enabled: active,
  });
  const obligationsQuery = useQuery({
    queryKey: [workspaceId, 'search', 'obligations', query],
    queryFn: () => listObligations({ workspaceId: workspaceId as string, search: query, pageSize: RESULT_LIMIT }),
    enabled: active,
  });

  const counterparties = useMemo(
    () => (active ? (counterpartiesQuery.data ?? []).filter((c) => matchesSearch(c.name, normalizeForSearch(query))) : []),
    [active, counterpartiesQuery.data, query]
  );
  const transactions = active ? (transactionsQuery.data ?? []) : [];
  const obligations = active ? (obligationsQuery.data ?? []) : [];
  const total = counterparties.length + transactions.length + obligations.length;
  const loading = active && (transactionsQuery.isLoading || obligationsQuery.isLoading);

  const show = (key: Exclude<Scope, 'all'>) => scope === 'all' || scope === key;
  const limit = (list: unknown[]) => (scope === 'all' ? PREVIEW_COUNT : list.length);

  const pills: { key: Scope; label: string }[] = [
    { key: 'all', label: `Tümü · ${total}` },
    { key: 'counterparties', label: `Cariler · ${counterparties.length}` },
    { key: 'transactions', label: `Hareketler · ${transactions.length}` },
    { key: 'obligations', label: `Kayıtlar · ${obligations.length}` },
  ];

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: theme.screenEdge.standard }}>
        <View
          style={{
            flex: 1,
            height: 36,
            borderRadius: 10,
            backgroundColor: theme.colors.fill,
            paddingHorizontal: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Ionicons name="search" size={17} color={theme.colors.textSecondary} />
          <TextInput
            autoFocus
            placeholder="Cari, hareket veya kayıt ara"
            placeholderTextColor={theme.colors.textSecondary}
            value={input}
            onChangeText={setInput}
            returnKeyType="search"
            autoCorrect={false}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            selectionColor={theme.colors.brandPrimary}
            style={{ flex: 1, fontSize: 17, color: theme.colors.textPrimary, padding: 0 }}
          />
          {input.length > 0 ? (
            <Pressable accessibilityLabel="Aramayı temizle" onPress={() => setInput('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={theme.colors.mutedControl} />
            </Pressable>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
          <Text style={{ fontSize: 17 }}>Vazgeç</Text>
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: theme.spacing.massive }}
      >
        {!active ? (
          <EmptyState
            icon="search-outline"
            title="Ara"
            message="Cari adı, hareket açıklaması veya kayıt başlığı yazın. En az 2 harf gerekir."
          />
        ) : loading ? (
          <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.lg, gap: theme.spacing.sm }}>
            <Skeleton height={56} borderRadius={theme.radius.group} />
            <Skeleton height={56} borderRadius={theme.radius.group} />
          </View>
        ) : total === 0 ? (
          <EmptyState icon="search-outline" title="Sonuç bulunamadı" message={`“${query}” için eşleşen bir şey yok.`} />
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, marginTop: theme.spacing.xs }}
              contentContainerStyle={{ gap: 8, paddingHorizontal: theme.screenEdge.standard }}
            >
              {pills.map((p) => (
                <Pill key={p.key} label={p.label} selected={scope === p.key} onPress={() => setScope(p.key)} />
              ))}
            </ScrollView>

            {show('counterparties') && counterparties.length > 0 ? (
              <Section title="Cari" more={scope === 'all' && counterparties.length > PREVIEW_COUNT ? `${counterparties.length} sonucun tümü` : undefined} onMore={() => setScope('counterparties')}>
                <Group>
                  {counterparties.slice(0, limit(counterparties)).map((c) => (
                    <GroupedRow
                      key={c.id}
                      leading={<GroupedRowAvatar initials={initials(c.name)} />}
                      title={c.name}
                      subtitle={getCounterpartyTypeLabel(c.type)}
                      onPress={() => router.push(`/counterparties/${c.id}`)}
                    />
                  ))}
                </Group>
              </Section>
            ) : null}

            {show('transactions') && transactions.length > 0 ? (
              <Section title="Hareketler" more={scope === 'all' && transactions.length > PREVIEW_COUNT ? `${transactions.length} sonucun tümü` : undefined} onMore={() => setScope('transactions')}>
                <Group inset={16}>
                  {transactions.slice(0, limit(transactions)).map((t) => {
                    const title = t.description?.trim() || t.counterparty?.name || t.category?.name || 'Hareket';
                    const sign = t.direction === 'income' ? '+' : t.direction === 'expense' ? '−' : '';
                    return (
                      <GroupedRow
                        key={t.id}
                        title={title}
                        subtitle={[t.counterparty?.name, t.account?.name, dayMonth.format(new Date(t.occurred_at))].filter(Boolean).join(' · ')}
                        onPress={() => router.push(`/transactions/${t.id}`)}
                        chevron={false}
                        trailing={
                          <Text tabular style={{ fontWeight: '600', color: t.direction === 'income' ? theme.colors.receivable : theme.colors.textPrimary }}>
                            {sign}
                            {formatMinorAmount(t.amount_minor, t.currency_code)}
                          </Text>
                        }
                      />
                    );
                  })}
                </Group>
              </Section>
            ) : null}

            {show('obligations') && obligations.length > 0 ? (
              <Section title="Kayıtlar" more={scope === 'all' && obligations.length > PREVIEW_COUNT ? `${obligations.length} sonucun tümü` : undefined} onMore={() => setScope('obligations')}>
                <Group>
                  {obligations.slice(0, limit(obligations)).map((o) => (
                    <GroupedRow
                      key={o.id}
                      leading={
                        <ObligationIcon
                          documentType={o.document_type}
                          bankCode={o.bank_code}
                          serviceCode={o.service_code}
                          fallbackName={o.title}
                          size={34}
                        />
                      }
                      title={o.title}
                      subtitle={[DOCUMENT_TYPE_LABEL[o.document_type] ?? 'Kayıt', o.counterparty?.name, o.due_date ? dayMonth.format(new Date(o.due_date)) : null]
                        .filter(Boolean)
                        .join(' · ')}
                      onPress={() => router.push(`/obligations/${o.id}`)}
                      chevron={false}
                      trailing={
                        <Text tabular style={{ fontWeight: '600' }}>
                          {o.value_unit_type === 'kiymetli_maden'
                            ? formatValueUnitAmount(o.remaining_amount_minor, o.currency_code)
                            : formatMinorAmount(o.remaining_amount_minor, o.currency_code)}
                        </Text>
                      }
                    />
                  ))}
                </Group>
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, more, onMore, children }: { title: string; more?: string; onMore: () => void; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ marginTop: theme.spacing.lg, paddingHorizontal: theme.screenEdge.standard }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingLeft: theme.spacing.xxs }}>
        <Text variant="label" color="textSecondary">
          {title}
        </Text>
        {more ? (
          <Pressable accessibilityRole="button" onPress={onMore} hitSlop={8}>
            <Text style={{ fontSize: 15 }} color="textSecondary">
              {more}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
