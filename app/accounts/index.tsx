import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Pressable, Row, Stack, Text } from '@/components/primitives';
import { listAccounts, type Account } from '@/features/accounts/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';

const TYPE_ICON: Record<Account['type'], keyof typeof Ionicons.glyphMap> = {
  cash: 'cash-outline',
  bank: 'business-outline',
  wallet: 'wallet-outline',
};

const TYPE_LABEL: Record<Account['type'], string> = {
  cash: 'Kasa',
  bank: 'Banka',
  wallet: 'Cüzdan',
};

export default function AccountsScreen() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const accounts = accountsQuery.data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Stack gap="lg" style={{ flex: 1, paddingTop: theme.spacing.md }}>
        <Row style={{ paddingHorizontal: theme.screenEdge.standard }} align="center">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
          </Pressable>
          <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
            Hesaplar
          </Text>
          <Pressable onPress={() => router.push('/accounts/new')} hitSlop={12}>
            <Ionicons name="add-circle" size={30} color={theme.colors.brandPrimary} />
          </Pressable>
        </Row>

        {accountsQuery.error ? (
          <Text
            variant="body"
            color="danger"
            style={{ paddingHorizontal: theme.screenEdge.standard }}
          >
            {accountsQuery.error instanceof Error ? accountsQuery.error.message : 'Hesaplar yüklenemedi'}
          </Text>
        ) : null}

        {accountsQuery.isSuccess && accounts.length === 0 ? (
          <Stack
            gap="xs"
            style={{ flex: 1, justifyContent: 'center', paddingHorizontal: theme.screenEdge.standard }}
          >
            <Text variant="cardTitle">Henüz hesap yok</Text>
            <Text variant="body" color="textSecondary">
              Kasa, banka veya cüzdan hesabı ekleyerek başlayın.
            </Text>
          </Stack>
        ) : (
          <FlatList
            data={accounts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: theme.screenEdge.standard,
              gap: theme.spacing.sm,
              paddingBottom: theme.spacing.xxl,
            }}
            renderItem={({ item }) => (
              <Row
                style={{
                  backgroundColor: theme.colors.surfacePrimary,
                  borderRadius: theme.radius.widget,
                  padding: theme.spacing.md,
                }}
                gap="sm"
              >
                <Ionicons
                  name={TYPE_ICON[item.type as Account['type']]}
                  size={22}
                  color={theme.colors.accentViolet}
                />
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="cardTitle">{item.name}</Text>
                  <Text variant="caption" color="textSecondary">
                    {TYPE_LABEL[item.type as Account['type']]}
                  </Text>
                </Stack>
                <Text variant="body" tabular>
                  {formatMinorAmount(item.opening_balance_minor, item.currency_code)}
                </Text>
              </Row>
            )}
          />
        )}
      </Stack>
    </SafeAreaView>
  );
}
