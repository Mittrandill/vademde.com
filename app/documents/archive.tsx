import { useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, EmptyState, SectionHeader, Stack, Text, TextField } from '@/components/primitives';
import { DetailScaffold } from '@/components/navigation/DetailScaffold';
import { ReceiptRow } from '@/components/finance/ReceiptRow';
import { getCounterparty } from '@/features/counterparties/api';
import { listReceiptArchive, normalizeName, useDocumentArchiveAccess } from '@/features/receipts/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { localeDateFormatter } from '@/i18n/format';
import { t, useLanguage } from '@/i18n';

const monthFormatter = localeDateFormatter({ month: 'long', year: 'numeric' });

// Belge arşivi (Plus): ödemelere eklenen dekontların tek yerde listesi. counterpartyId
// verilirse yalnızca o cariyle ilgili dekontlar gösterilir (cari sayfasındaki "Tümünü gör").
export default function ReceiptArchiveScreen() {
  const language = useLanguage();
  const theme = useTheme();
  const { counterpartyId } = useLocalSearchParams<{ counterpartyId?: string }>();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const archive = useDocumentArchiveAccess();
  const [search, setSearch] = useState('');

  const counterpartyQuery = useQuery({
    queryKey: ['counterparty', counterpartyId],
    queryFn: () => getCounterparty(counterpartyId as string),
    enabled: !!counterpartyId,
  });

  const archiveQuery = useQuery({
    queryKey: [activeWorkspaceId, 'receipt-archive', counterpartyId ?? 'all', language],
    queryFn: () => listReceiptArchive({ workspaceId: activeWorkspaceId as string, counterpartyId }),
    enabled: !!activeWorkspaceId && archive.allowed,
  });

  const items = useMemo(() => {
    const all = archiveQuery.data ?? [];
    const term = normalizeName(search);
    if (!term) return all;
    return all.filter((item) => normalizeName(`${item.title} ${item.counterpartyName ?? ''}`).includes(term));
  }, [archiveQuery.data, search]);

  const sections = useMemo(() => {
    const groups: { title: string; data: typeof items }[] = [];
    for (const item of items) {
      const title = monthFormatter.format(new Date(item.date));
      const last = groups[groups.length - 1];
      if (last && last.title === title) last.data.push(item);
      else groups.push({ title, data: [item] });
    }
    return groups;
  }, [items]);

  const title = counterpartyId
    ? t('archive.counterpartyTitle', { name: counterpartyQuery.data?.name ?? t('archive.counterpartyFallback') })
    : t('archive.title');

  return (
    <DetailScaffold
      showTitle
      header={{ title }}
      isLoading={archive.isLoading || (archive.allowed && archiveQuery.isPending)}
      error={archiveQuery.error}
      errorFallbackMessage={t('archive.loadFailed')}
    >
      {!archive.allowed ? (
        <Stack gap="lg" align="center" style={{ paddingVertical: theme.spacing.xl }}>
          <EmptyState
            icon="lock-closed-outline"
            title={t('archive.lockedTitle')}
            message={t('archive.lockedBody')}
          />
          <Button label={t('archive.seePlans')} onPress={() => router.push('/paywall')} />
        </Stack>
      ) : (
        <Stack gap="lg">
          <TextField
            placeholder={t('archive.search')}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {sections.length === 0 ? (
            <EmptyState
              icon="folder-open-outline"
              title={search ? t('archive.noResults') : t('archive.empty')}
              message={search ? t('archive.noResultsBody') : t('archive.emptyBody')}
            />
          ) : (
            sections.map((section) => (
              <Stack gap="xs" key={section.title}>
                <SectionHeader title={section.title} />
                <Stack gap="xs">
                  {section.data.map((item) => (
                    <ReceiptRow key={item.documentId} item={item} hideCounterparty={!!counterpartyId} />
                  ))}
                </Stack>
              </Stack>
            ))
          )}
          <Text variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>
            {items.length} dekont
          </Text>
        </Stack>
      )}
    </DetailScaffold>
  );
}
