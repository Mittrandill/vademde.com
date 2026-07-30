import { useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Pressable, Row, Stack, Text, TextField } from '@/components/primitives';
import { listCounterparties } from '@/features/counterparties/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';

export default function CounterpartiesScreen() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [search, setSearch] = useState('');

  const counterpartiesQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.counterparties(activeWorkspaceId) : ['counterparties', 'disabled'],
    queryFn: () => listCounterparties(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const filtered = useMemo(() => {
    const counterparties = counterpartiesQuery.data ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return counterparties;
    return counterparties.filter((c) => c.name.toLowerCase().includes(query));
  }, [counterpartiesQuery.data, search]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Stack gap="lg" style={{ flex: 1, paddingTop: theme.spacing.md }}>
        <Row style={{ paddingHorizontal: theme.screenEdge.standard }} align="center">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
          </Pressable>
          <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
            Kişi / Firmalar
          </Text>
          <Pressable onPress={() => router.push('/counterparties/new')} hitSlop={12}>
            <Ionicons name="add-circle" size={30} color={theme.colors.brandPrimary} />
          </Pressable>
        </Row>

        <Stack style={{ paddingHorizontal: theme.screenEdge.standard }}>
          <TextField placeholder="Ara..." value={search} onChangeText={setSearch} />
        </Stack>

        {counterpartiesQuery.isSuccess && filtered.length === 0 ? (
          <Stack
            gap="xs"
            style={{ flex: 1, justifyContent: 'center', paddingHorizontal: theme.screenEdge.standard }}
          >
            <Text variant="cardTitle">
              {(counterpartiesQuery.data ?? []).length === 0 ? 'Henüz kişi/firma yok' : 'Eşleşen kişi/firma bulunamadı'}
            </Text>
          </Stack>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: theme.screenEdge.standard,
              gap: theme.spacing.sm,
              paddingBottom: theme.spacing.xxl,
            }}
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push({ pathname: '/counterparties/new', params: { id: item.id } })}>
                <Row
                  gap="sm"
                  style={{
                    backgroundColor: theme.colors.surfacePrimary,
                    borderRadius: theme.radius.widget,
                    padding: theme.spacing.md,
                  }}
                >
                  <Ionicons
                    name={item.type === 'company' ? 'business-outline' : 'person-outline'}
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="cardTitle">{item.name}</Text>
                    {item.phone || item.email ? (
                      <Text variant="caption" color="textSecondary">
                        {[item.phone, item.email].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </Stack>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </Row>
              </Pressable>
            )}
          />
        )}
      </Stack>
    </SafeAreaView>
  );
}
