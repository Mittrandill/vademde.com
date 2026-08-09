import { useState } from 'react';
import { Alert, SectionList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import {
  ActionSheet,
  Card,
  Divider,
  EmptyState,
  Pagination,
  Pressable,
  Row,
  SectionHeader,
  SegmentedControl,
  Stack,
  Text,
} from '@/components/primitives';
import { StatColumns } from '@/components/primitives/StatColumns';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { DetailScaffold } from '@/components/navigation/DetailScaffold';
import { DetailHeroCard, DetailMetricRow } from '@/components/finance/DetailHero';
import { Amount } from '@/components/finance/Amount';
import { BankLogo } from '@/components/finance/BankLogo';
import { CreditCardVisual } from '@/components/finance/CreditCardVisual';
import { HeroStatCard } from '@/components/finance/HeroStatCard';
import { archiveAccount, getAccount, type Account } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/reports/api';
import { listObligations, type ObligationWithRelations } from '@/features/obligations/api';
import { listTransactions, type TransactionWithRelations } from '@/features/transactions/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { maskIban } from '@/utils/iban';
import { formatMinorAmount } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';
import { showSaveSuccess, showErrorAlert } from '@/utils/alerts';
import { groupByDay } from '@/utils/groupByDay';
import { computeStatementPeriod, periodKeyFor, periodKeyForDueDate } from '@/utils/creditCardPeriod';
import type { ValueUnitType } from '@/features/valueUnits/units';

const TYPE_ICON: Record<Account['type'], keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline',
  bank: 'business-outline',
  wallet: 'wallet-outline',
  credit_card: 'card-outline',
};

const TYPE_LABEL: Record<Account['type'], string> = {
  cash: 'Kasa',
  bank: 'Banka',
  wallet: 'Cüzdan',
  credit_card: 'Kredi Kartı',
};

const PAGE_SIZE = 10;

const monthFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

type CreditCardTab = 'genel' | 'ekstreler' | 'hareketler';

interface StatementMonth {
  periodKey: string;
  monthDate: Date;
  /** Bu dönem için beklenen son ödeme tarihi (statement_day/payment_due_day'den hesaplanır) —
   * yeni bir ekstre eklenirken tarih alanını akıllıca doldurmak için kullanılır. */
  dueDate: Date | null;
  obligation: ObligationWithRelations | null;
}

export default function AccountDetailScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [page, setPage] = useState(0);
  // Yalnızca kredi kartı hesabında kullanılır (bkz. aşağıdaki kredi kartı dalı) —
  // hook sırası bozulmasın diye diğer hesap türlerinde de koşulsuz çağrılır.
  const [tab, setTab] = useState<CreditCardTab>('genel');
  const [statementSheetMonth, setStatementSheetMonth] = useState<StatementMonth | null>(null);

  const accountQuery = useQuery({
    queryKey: ['account', id],
    queryFn: () => getAccount(id as string),
    enabled: !!id,
  });

  const balancesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'account-balances'] : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const transactionsQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'transactions', 'account', id] : ['transactions', 'disabled'],
    queryFn: () => listTransactions({ workspaceId: activeWorkspaceId as string, accountId: id as string }),
    enabled: !!activeWorkspaceId && !!id,
  });

  const allTransactions = transactionsQuery.data ?? [];
  const totalPages = Math.max(1, Math.ceil(allTransactions.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages - 1);
  const pagedTransactions = allTransactions.slice(effectivePage * PAGE_SIZE, effectivePage * PAGE_SIZE + PAGE_SIZE);
  const sections = groupByDay(pagedTransactions, (item) => item.occurred_at);

  // Kredi kartı hesabında "ay ay ekstre yüklendi mi" özeti — hesap kesiminden sonra
  // oluşturulan her kredi_karti_ekstresi obligation'ı ilgili aya (due_date) eşler.
  const isCreditCardAccount = accountQuery.data?.type === 'credit_card';
  const statementsQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'obligations', 'account-statements', id] : ['account-statements', 'disabled'],
    queryFn: () =>
      listObligations({
        workspaceId: activeWorkspaceId as string,
        accountId: id as string,
        documentType: 'kredi_karti_ekstresi',
        pageSize: 24,
        ascending: false,
      }),
    enabled: !!activeWorkspaceId && !!id && isCreditCardAccount,
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveAccount(id as string),
    onSuccess: () => {
      showSaveSuccess('Hesap başarıyla arşivlendi.', () => router.back(), () => {
        if (activeWorkspaceId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.accounts(activeWorkspaceId) });
          queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'account-balances'] });
        }
        queryClient.removeQueries({ queryKey: ['account', id] });
      });
    },
    onError: (error) => showErrorAlert(error),
  });

  function confirmArchive() {
    Alert.alert('Hesabı Arşivle', 'Bu hesap listeden kaldırılacak, geçmiş hareketleri korunur. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Arşivle', style: 'destructive', onPress: () => archiveMutation.mutate() },
    ]);
  }

  if (accountQuery.isLoading || !accountQuery.data) {
    return (
      <DetailScaffold
        header={{ title: '' }}
        isLoading
        error={accountQuery.error}
        errorFallbackMessage="Hesap yüklenemedi"
      >
        {null}
      </DetailScaffold>
    );
  }

  const account = accountQuery.data;
  const type = account.type as Account['type'];
  const balanceMinor =
    balancesQuery.data?.find((b) => b.accountId === account.id)?.balanceMinor ?? account.opening_balance_minor;
  const overdraftLimitMinor = account.overdraft_limit_minor ?? 0;
  const hasOverdraft = type === 'bank' && overdraftLimitMinor > 0;

  // Son 6 ay (bu ay dahil): her biri için o KESİM ayına ait bir ekstre (obligation) var
  // mı diye bakılır — varsa borç tutarıyla birlikte gösterilir ve dokununca o ekstrenin
  // detayına (obligations/[id]) gidilir, yoksa "Yüklenmedi" rozeti (artık dokunulabilir).
  // Dönem, obligation'ın due_date'inin kendi ayı DEĞİL, o due_date'in periodKeyForDueDate
  // ile geriye doğru eşlendiği kesim ayıdır — son ödeme tarihi sıklıkla bir sonraki aya
  // sarktığı için (bkz. utils/creditCardPeriod.ts) ham due_date ayına bakmak yanlış olurdu.
  const statementMonths: StatementMonth[] = isCreditCardAccount
    ? Array.from({ length: 6 }, (_, i) => {
        const now = new Date();
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const period = computeStatementPeriod(account, monthDate);
        const periodKey = period?.periodKey ?? periodKeyFor(monthDate);
        const obligation =
          (statementsQuery.data ?? []).find((o) => o.due_date && periodKeyForDueDate(account, o.due_date) === periodKey) ??
          null;
        return { periodKey, monthDate, dueDate: period?.dueDate ?? null, obligation };
      })
    : [];
  const mostRecentUnfulfilled = statementMonths.find((m) => !m.obligation);

  // Ekran web'de doğrudan bu URL'e gidilerek (sayfa yenileme, deep link) açılırsa
  // stack'te geri gidilecek bir geçmiş olmayabilir — o durumda hesabın türüne uygun
  // listeye düşülür (credit-cards.tsx'teki aynı korumaya bkz.).
  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(isCreditCardAccount ? '/accounts/credit-cards' : '/accounts');
    }
  }

  if (isCreditCardAccount) {
    // app/obligations/[id].tsx'teki kredi detayıyla aynı hero + sekme deseni
    // (DetailScaffold/DetailHeroCard üzerinden paylaşılıyor): fiziksel kart görseli
    // üstte, altında büyük tutar + limit kullanım halkasından oluşan hero kart,
    // ardından Genel/Ekstreler/Hareketler sekmeleri.
    const hasLimit = (account.credit_limit_minor ?? 0) > 0;
    const utilization = hasLimit ? balanceMinor / (account.credit_limit_minor as number) : 0;
    const clampedUtilization = Math.max(0, Math.min(1, utilization));
    const availableMinor = hasLimit ? Math.max(0, (account.credit_limit_minor as number) - balanceMinor) : 0;
    const stateAccent =
      balanceMinor <= 0 ? theme.colors.success : clampedUtilization >= 0.9 ? theme.colors.danger : theme.colors.brandPrimary;
    const heroAmountColor = balanceMinor > 0 ? theme.colors.danger : theme.colors.textPrimary;
    const loadedStatementCount = statementMonths.filter((m) => m.obligation).length;

    const tabOptions: { key: CreditCardTab; label: string }[] = [
      { key: 'genel', label: 'Genel' },
      { key: 'ekstreler', label: `Ekstreler (${loadedStatementCount})` },
      { key: 'hareketler', label: 'Hareketler' },
    ];

    return (
      <>
      <DetailScaffold
        header={{
          title: account.name,
          left: { icon: 'chevron-back', accessibilityLabel: 'Geri', onPress: goBack },
          right: {
            icon: 'pencil',
            accessibilityLabel: 'Düzenle',
            onPress: () => router.push({ pathname: '/accounts/new', params: { id: account.id } }),
          },
        }}
        isLoading={false}
      >
        <CreditCardVisual account={account} />

        <DetailHeroCard
          sections={[
            <DetailMetricRow
              key="metric"
              label="GÜNCEL BORÇ"
              value={formatMinorAmount(balanceMinor, account.currency_code)}
              valueStyle={{ color: heroAmountColor }}
              ring={
                hasLimit
                  ? {
                      progress: clampedUtilization,
                      color: stateAccent,
                      trackColor: withAlpha(stateAccent, 0.18),
                      centerContent: (
                        <Text variant="cardTitle" tabular>
                          %{Math.round(clampedUtilization * 100)}
                        </Text>
                      ),
                    }
                  : undefined
              }
            />,
            <StatColumns
              key="stats"
              columns={[
                {
                  label: 'SON ÖDEME GÜNÜ',
                  value: account.payment_due_day ? `Her ayın ${account.payment_due_day}.` : 'Yok',
                },
                {
                  label: 'KULLANILABİLİR LİMİT',
                  value: hasLimit ? formatMinorAmount(availableMinor, account.currency_code) : 'Yok',
                  align: 'flex-end',
                },
              ]}
            />,
          ]}
        />

        <SegmentedControl options={tabOptions} value={tab} onChange={setTab} size="compact" stretch />

        {tab === 'genel' ? (
          <Card>
            <Stack gap="md">
              <Row gap="sm" align="center">
                <Ionicons name="card-outline" size={18} color={theme.colors.brandPrimary} />
                <Text variant="cardTitle">Kart Bilgileri</Text>
              </Row>
              <Divider />
              <InfoRow label="Kart No" value={`•••• ${account.card_last_four ?? '····'}`} />
              <InfoRow label="Kesim Günü" value={account.statement_day ? `Her ayın ${account.statement_day}.` : 'Yok'} />
              <InfoRow
                label="Son Ödeme Günü"
                value={account.payment_due_day ? `Her ayın ${account.payment_due_day}.` : 'Yok'}
              />
              {hasLimit ? (
                <InfoRow
                  label="Kredi Limiti"
                  value={formatMinorAmount(account.credit_limit_minor as number, account.currency_code)}
                />
              ) : null}
              <InfoRow label="Güncel Borç" value={formatMinorAmount(balanceMinor, account.currency_code)} />
              {hasLimit ? (
                <InfoRow label="Kullanılabilir Limit" value={formatMinorAmount(availableMinor, account.currency_code)} />
              ) : null}
            </Stack>
          </Card>
        ) : tab === 'ekstreler' ? (
          <Stack gap="sm">
            <Card>
              <Stack gap="sm">
                {statementMonths.map((m, index) => {
                  const row = (
                    <Row align="center">
                      <Text variant="body" style={{ flex: 1, textTransform: 'capitalize' }}>
                        {monthFormatter.format(m.monthDate)}
                      </Text>
                      {m.obligation ? (
                        <Row gap="sm" align="center">
                          <Amount
                            amountMinor={m.obligation.remaining_amount_minor}
                            currencyCode={m.obligation.currency_code}
                            valueUnitType={m.obligation.value_unit_type as ValueUnitType}
                            variant="body"
                          />
                          <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
                        </Row>
                      ) : (
                        <Row
                          gap="xxs"
                          align="center"
                          style={{
                            paddingHorizontal: theme.spacing.xs,
                            paddingVertical: 2,
                            borderRadius: 999,
                            backgroundColor: withAlpha(theme.colors.textSecondary, 0.14),
                          }}
                        >
                          <Ionicons name="alert-circle-outline" size={13} color={theme.colors.textSecondary} />
                          <Text variant="caption" color="textSecondary">
                            Yüklenmedi
                          </Text>
                        </Row>
                      )}
                    </Row>
                  );

                  return (
                    <View key={m.periodKey}>
                      {m.obligation ? (
                        <Pressable onPress={() => router.push(`/obligations/${m.obligation!.id}`)}>{row}</Pressable>
                      ) : (
                        // Herhangi bir geçmiş "Yüklenmedi" ayına dokunarak o ayın ekstresini
                        // eklemeye başlanabilir — artık yalnızca en son boşluk için değil.
                        <Pressable onPress={() => setStatementSheetMonth(m)}>{row}</Pressable>
                      )}
                      {index < statementMonths.length - 1 ? (
                        <Divider style={{ marginTop: theme.spacing.sm }} />
                      ) : null}
                    </View>
                  );
                })}
              </Stack>
            </Card>
            {mostRecentUnfulfilled ? (
              <Pressable
                onPress={() => setStatementSheetMonth(mostRecentUnfulfilled)}
                style={{
                  height: theme.controlHeight.segmented,
                  borderRadius: theme.radius.widget,
                  borderWidth: 1,
                  borderColor: theme.colors.brandPrimary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: theme.spacing.xxs,
                }}
              >
                <Ionicons name="add-circle-outline" size={16} color={theme.colors.brandPrimary} />
                <Text variant="body" color="brandPrimary">
                  {monthFormatter.format(mostRecentUnfulfilled.monthDate)} Ekstresi Ekle
                </Text>
              </Pressable>
            ) : null}
          </Stack>
        ) : (
          <Stack gap="md">
            {sections.length === 0 ? (
              <EmptyState icon="receipt-outline" message="Bu hesapta henüz hareket yok." />
            ) : (
              <Stack gap="md">
                {sections.map((section) => (
                  <Stack gap="xs" key={section.title}>
                    <SectionHeader title={section.title} />
                    <Stack gap="xs">
                      {section.data.map((item) => (
                        <TransactionRow key={item.id} item={item} />
                      ))}
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            )}
            {totalPages > 1 ? <Pagination page={effectivePage} totalPages={totalPages} onChange={setPage} /> : null}
          </Stack>
        )}

        <Pressable
          onPress={confirmArchive}
          style={{
            height: theme.controlHeight.segmented,
            borderRadius: theme.radius.widget,
            borderWidth: 1,
            borderColor: theme.colors.danger,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: theme.spacing.xxs,
          }}
        >
          <Ionicons name="archive-outline" size={16} color={theme.colors.danger} />
          <Text variant="body" color="danger">
            Hesabı Arşivle
          </Text>
        </Pressable>
      </DetailScaffold>

      {statementSheetMonth ? (
        <ActionSheet
          visible
          title={`${monthFormatter.format(statementSheetMonth.monthDate)} Ekstresi Ekle`}
          onClose={() => setStatementSheetMonth(null)}
          options={[
            {
              key: 'scan',
              label: 'Kameradan/Galeriden Tara',
              description: 'OCR belgeyi okur; hesap ve dönem otomatik eşlenir.',
              icon: 'camera-outline',
              onPress: () =>
                router.push({
                  pathname: '/(tabs)/tara',
                  params: {
                    accountId: account.id,
                    documentType: 'kredi_karti_ekstresi',
                    ...(statementSheetMonth.dueDate ? { expectedDueDate: toIsoDate(statementSheetMonth.dueDate) } : {}),
                  },
                }),
            },
            {
              key: 'manual',
              label: 'Manuel Gir',
              description: 'Tutar ve vadeyi elle girin.',
              icon: 'create-outline',
              onPress: () =>
                router.push({
                  pathname: '/obligations/new',
                  params: {
                    type: 'kredi_karti_ekstresi',
                    accountId: account.id,
                    ...(statementSheetMonth.dueDate ? { dueDate: toIsoDate(statementSheetMonth.dueDate) } : {}),
                  },
                }),
            },
          ]}
        />
      ) : null}
      </>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.xs,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <Stack gap="lg" style={{ marginBottom: theme.spacing.lg }}>
            <ScreenHeader
              title={account.name}
              left={{ icon: 'chevron-back', accessibilityLabel: 'Geri', onPress: goBack }}
              right={{
                icon: 'pencil',
                accessibilityLabel: 'Düzenle',
                onPress: () => router.push({ pathname: '/accounts/new', params: { id: account.id } }),
              }}
            />

            <HeroStatCard
              label="GÜNCEL BAKİYE"
              amountMinor={balanceMinor}
              currencyCode={account.currency_code}
              danger={balanceMinor < 0}
              above={
                <Row gap="sm" align="center">
                  <BankLogo bankCode={account.bank_code} fallbackIcon={TYPE_ICON[type]} size={44} />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Row gap="xs" align="center">
                      <View
                        style={{
                          paddingHorizontal: theme.spacing.xs,
                          paddingVertical: 2,
                          borderRadius: 999,
                          backgroundColor: withAlpha(theme.colors.textSecondary, 0.14),
                        }}
                      >
                        <Text variant="caption" color="textSecondary">
                          {TYPE_LABEL[type]}
                        </Text>
                      </View>
                    </Row>
                    {account.iban ? (
                      <Text variant="caption" color="textSecondary" tabular>
                        {maskIban(account.iban)}
                      </Text>
                    ) : null}
                  </Stack>
                </Row>
              }
            />

            {hasOverdraft ? (
              <OverdraftCard accountId={account.id} balanceMinor={balanceMinor} limitMinor={overdraftLimitMinor} currencyCode={account.currency_code} />
            ) : null}

            <Text variant="sectionTitle">Hareketler</Text>
          </Stack>
        }
        renderSectionHeader={({ section }) => (
          <View style={{ paddingTop: theme.spacing.sm }}>
            <SectionHeader title={section.title} />
          </View>
        )}
        renderItem={({ item }) => <TransactionRow item={item} />}
        ListEmptyComponent={<EmptyState icon="receipt-outline" message="Bu hesapta henüz hareket yok." />}
        ListFooterComponent={
          <Stack gap="lg" style={{ marginTop: theme.spacing.sm }}>
            {totalPages > 1 ? <Pagination page={effectivePage} totalPages={totalPages} onChange={setPage} /> : null}
            <Pressable
              onPress={confirmArchive}
              style={{
                height: theme.controlHeight.segmented,
                borderRadius: theme.radius.widget,
                borderWidth: 1,
                borderColor: theme.colors.danger,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: theme.spacing.xxs,
              }}
            >
              <Ionicons name="archive-outline" size={16} color={theme.colors.danger} />
              <Text variant="body" color="danger">
                Hesabı Arşivle
              </Text>
            </Pressable>
          </Stack>
        }
      />
    </SafeAreaView>
  );
}

interface OverdraftCardProps {
  accountId: string;
  balanceMinor: number;
  limitMinor: number;
  currencyCode: string;
}

// Ek hesap (KMH): bakiye sıfırın altına indiğinde kullanılan tutar, limitle sınırlıdır.
// Faiz bankadan bankaya/güne göre değiştiği için otomatik hesaplanmaz — kullanıcı ayına ait
// tutarı öğrendiğinde tek dokunuşla gider olarak eklenir (bkz. /transactions/new accountId ön dolumu).
function OverdraftCard({ accountId, balanceMinor, limitMinor, currencyCode }: OverdraftCardProps) {
  const theme = useTheme();
  const usedMinor = Math.min(Math.max(-balanceMinor, 0), limitMinor);
  const availableMinor = Math.max(0, limitMinor - usedMinor);

  return (
    <Card>
      <Stack gap="md">
        <Row gap="sm" align="center">
          <Ionicons name="trending-down-outline" size={18} color={theme.colors.brandPrimary} />
          <Text variant="cardTitle">Ek Hesap (KMH)</Text>
        </Row>
        <Divider />
        <InfoRow label="Ek Hesap Limiti" value={formatMinorAmount(limitMinor, currencyCode)} />
        <InfoRow label="Kullanılan" value={formatMinorAmount(usedMinor, currencyCode)} />
        <InfoRow label="Kullanılabilir" value={formatMinorAmount(availableMinor, currencyCode)} />
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/transactions/new',
              params: { accountId, direction: 'expense', description: 'Ek hesap faizi' },
            })
          }
          style={{
            height: theme.controlHeight.segmented,
            borderRadius: theme.radius.widget,
            borderWidth: 1,
            borderColor: theme.colors.brandPrimary,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: theme.spacing.xxs,
          }}
        >
          <Ionicons name="add-circle-outline" size={16} color={theme.colors.brandPrimary} />
          <Text variant="body" color="brandPrimary">
            Ek Hesap Faizi Ekle
          </Text>
        </Pressable>
      </Stack>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Row align="center">
      <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="body" tabular numberOfLines={1} style={{ maxWidth: '55%', textAlign: 'right' }}>
        {value}
      </Text>
    </Row>
  );
}

function TransactionRow({ item }: { item: TransactionWithRelations }) {
  const sign = item.direction === 'expense' ? -1 : item.direction === 'income' ? 1 : 0;

  return (
    <Pressable onPress={() => router.push(`/transactions/${item.id}`)}>
      <Card>
        <Row align="center">
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="body" numberOfLines={1}>
              {item.description || item.category?.name || item.counterparty?.name || 'Hareket'}
            </Text>
            <Text variant="caption" color="textSecondary">
              {item.category?.name ?? (sign > 0 ? 'Gelir' : sign < 0 ? 'Gider' : 'Transfer')}
            </Text>
          </Stack>
          <Amount
            amountMinor={item.amount_minor}
            currencyCode={item.currency_code}
            direction={item.direction as 'income' | 'expense' | 'transfer'}
            variant="body"
          />
        </Row>
      </Card>
    </Pressable>
  );
}
