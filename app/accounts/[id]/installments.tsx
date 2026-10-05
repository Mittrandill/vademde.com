import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import {
  AmountField,
  BottomSheet,
  Button,
  EmptyState,
  FormRow,
  MonthYearSheet,
  Pressable,
  Skeleton,
  Stack,
  Text,
  TextField,
} from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { HeroAmount } from '@/components/finance/HeroAmount';
import { InstallmentStrip } from '@/components/finance/InstallmentStrip';
import { MONTH_NAMES } from '@/components/primitives/MonthStepper';
import { getAccount } from '@/features/accounts/api';
import {
  createCardInstallmentPurchase,
  deleteCardInstallmentPurchase,
  listCardInstallmentPurchases,
  progressOf,
  statementLoads,
} from '@/features/cardInstallments/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { parseAmountToMinor, formatMinorAmount } from '@/utils/money';

function monthLabel(isoDate: string) {
  const [y, m] = isoDate.split('-').map(Number);
  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
}

// design KartTaksitleri.html: kartın taksitli alışverişleri ve gelecek ekstrelere yansıyan yük.
// Ödenen taksit sayısı ekstre aylarına göre türetilir; ekstre taramasıyla otomatik eşleştirme yoktur.
export default function CardInstallmentsScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [addOpen, setAddOpen] = useState(false);

  const accountQuery = useQuery({
    queryKey: ['account', id],
    queryFn: () => getAccount(id as string),
    enabled: !!id,
  });
  const purchasesQuery = useQuery({
    queryKey: activeWorkspaceId ? [activeWorkspaceId, 'card-installments', id] : ['card-installments', 'disabled'],
    queryFn: () => listCardInstallmentPurchases(activeWorkspaceId as string, id as string),
    enabled: !!activeWorkspaceId && !!id,
  });

  const purchases = useMemo(() => purchasesQuery.data ?? [], [purchasesQuery.data]);
  const progress = useMemo(() => purchases.map((p) => progressOf(p)), [purchases]);
  const active = progress.filter((p) => p.paidCount < p.purchase.installment_count);
  const totalRemaining = progress.reduce((s, p) => s + p.remainingMinor, 0);
  const loads = useMemo(() => statementLoads(purchases), [purchases]);
  const maxLoad = Math.max(1, ...loads.map((l) => l.minor));
  const lastMonth = purchases.reduce<string | null>((latest, p) => {
    const [y, m] = p.first_statement_month.split('-').map(Number);
    const idx = y * 12 + (m - 1) + p.installment_count - 1;
    const iso = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}-01`;
    return !latest || iso > latest ? iso : latest;
  }, null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'card-installments', id] });
  const deleteMutation = useMutation({ mutationFn: deleteCardInstallmentPurchase, onSuccess: refresh });

  function confirmDelete(purchaseId: string, merchant: string) {
    Alert.alert('Alışverişi sil', `${merchant} taksit kaydı silinecek. Kart hareketleri etkilenmez.`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate(purchaseId) },
    ]);
  }

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{ padding: theme.screenEdge.standard, gap: theme.spacing.lg, paddingBottom: theme.spacing.massive }}
      >
        <ScreenHeader
          title={`${accountQuery.data?.name ?? 'Kart'} · taksitler`}
          right={{ icon: 'add', accessibilityLabel: 'Taksitli alışveriş ekle', variant: 'accent', onPress: () => setAddOpen(true) }}
        />

        {purchasesQuery.isLoading ? (
          <Skeleton height={160} borderRadius={theme.radius.widget} />
        ) : purchases.length === 0 ? (
          <EmptyState
            icon="card-outline"
            title="Taksitli alışveriş yok"
            message="Taksitli bir alışveriş ekle; gelecek ekstrelere ne kadar yansıyacağını burada gör."
            actionLabel="Alışveriş ekle"
            onActionPress={() => setAddOpen(true)}
          />
        ) : (
          <>
            <Stack gap="xs">
              <Text variant="label" color="textSecondary">
                Gelecek ekstrelere yansıyacak
              </Text>
              <HeroAmount amountMinor={totalRemaining} baseSize={48} />
              <Text variant="caption" color="textSecondary">
                {active.length} taksitli alışveriş
                {lastMonth ? ` · son taksit ${MONTH_NAMES[Number(lastMonth.slice(5, 7)) - 1]} ${lastMonth.slice(0, 4)}` : ''}
              </Text>
            </Stack>

            <Stack gap="xs">
              <Text variant="label" color="textSecondary">
                Ekstre başına taksit yükü
              </Text>
              {loads.map((load) => (
                <View key={load.month} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Text variant="label" color="textSecondary" tabular style={{ width: 52, textTransform: 'none' }}>
                    {monthLabel(load.month)}
                  </Text>
                  <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: theme.colors.border, overflow: 'hidden' }}>
                    <View
                      style={{
                        width: `${(load.minor / maxLoad) * 100}%`,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: theme.colors.payable,
                      }}
                    />
                  </View>
                  <Text variant="label" tabular style={{ width: 84, textAlign: 'right', textTransform: 'none' }}>
                    {formatMinorAmount(load.minor).replace(/,00$/, '')}
                  </Text>
                </View>
              ))}
            </Stack>

            <Stack gap="xxs">
              <Text variant="label" color="textSecondary">
                Alışverişler
              </Text>
              {progress.map((p, index) => (
                <Pressable
                  key={p.purchase.id}
                  accessibilityRole="button"
                  accessibilityHint="Silmek için uzun bas"
                  onLongPress={() => confirmDelete(p.purchase.id, p.purchase.merchant)}
                  style={{
                    gap: theme.spacing.xs,
                    paddingVertical: theme.spacing.sm,
                    borderBottomWidth: index === progress.length - 1 ? 0 : 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
                    <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
                      {p.purchase.merchant}
                    </Text>
                    <Text variant="cardTitle" tabular>
                      {formatMinorAmount(p.monthlyMinor)}/ay
                    </Text>
                  </View>
                  <InstallmentStrip
                    items={p.amounts.map((_, i) => ({
                      status: i < p.paidCount ? 'paid' : i === p.paidCount ? 'next' : 'upcoming',
                    }))}
                    height={8}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="caption" color="textSecondary">
                      {p.purchase.installment_count} taksit · {p.paidCount}/{p.purchase.installment_count} ödendi
                    </Text>
                    <Text variant="caption" color="textSecondary" tabular>
                      kalan {formatMinorAmount(p.remainingMinor)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </Stack>
          </>
        )}

        <Text variant="caption" color="textSecondary">
          Taksitler her ay ilgili ekstre dönemine sayılır; ödenen taksit sayısı ekstre aylarından hesaplanır.
        </Text>
      </ScrollView>

      <AddPurchaseSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          refresh();
        }}
        workspaceId={activeWorkspaceId}
        accountId={id as string}
      />
    </SafeAreaView>
  );
}

function AddPurchaseSheet({
  visible,
  onClose,
  onSaved,
  workspaceId,
  accountId,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  workspaceId: string | null;
  accountId: string;
}) {
  const now = new Date();
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState('3');
  const [month, setMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [monthOpen, setMonthOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const totalMinor = parseAmountToMinor(amount);
      const installmentCount = Number(count);
      if (!merchant.trim()) throw new Error('Alışveriş adını gir.');
      if (!totalMinor || totalMinor <= 0) throw new Error('Toplam tutarı gir.');
      if (!Number.isInteger(installmentCount) || installmentCount < 2 || installmentCount > 60) {
        throw new Error('Taksit sayısı 2 ile 60 arasında olmalı.');
      }
      await createCardInstallmentPurchase({
        workspaceId: workspaceId as string,
        accountId,
        merchant,
        totalMinor,
        installmentCount,
        firstStatementMonth: `${month.year}-${String(month.month + 1).padStart(2, '0')}-01`,
      });
    },
    onSuccess: () => {
      setMerchant('');
      setAmount('');
      setCount('3');
      setError(null);
      onSaved();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Kaydedilemedi.'),
  });

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Taksitli alışveriş">
      <Stack gap="sm">
        <TextField label="ALIŞVERİŞ" placeholder="Örn. Teknosa · dizüstü" value={merchant} onChangeText={setMerchant} />
        <AmountField label="TOPLAM TUTAR (₺)" placeholder="0,00" value={amount} onChangeText={setAmount} />
        <TextField label="TAKSİT SAYISI" keyboardType="number-pad" value={count} onChangeText={setCount} />
        <FormRow
          label="İLK TAKSİTİN EKSTRESİ"
          value={`${MONTH_NAMES[month.month]} ${month.year}`}
          onPress={() => setMonthOpen(true)}
        />
        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}
        <Button label="Kaydet" onPress={() => mutation.mutate()} loading={mutation.isPending} />
      </Stack>
      <MonthYearSheet visible={monthOpen} onClose={() => setMonthOpen(false)} year={month.year} month={month.month} onChange={setMonth} />
    </BottomSheet>
  );
}
