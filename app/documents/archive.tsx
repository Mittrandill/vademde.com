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

const monthFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });

// Belge arşivi (Plus): ödemelere eklenen dekontların tek yerde listesi. counterpartyId
// verilirse yalnızca o cariyle ilgili dekontlar gösterilir (cari sayfasındaki "Tümünü gör").
export default function ReceiptArchiveScreen() {
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
    queryKey: [activeWorkspaceId, 'receipt-archive', counterpartyId ?? 'all'],
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

  const title = counterpartyId ? `${counterpartyQuery.data?.name ?? 'Cari'} dekontları` : 'Belge arşivi';

  return (
    <DetailScaffold
      showTitle
      header={{ title }}
      isLoading={archive.isLoading || (archive.allowed && archiveQuery.isPending)}
      error={archiveQuery.error}
      errorFallbackMessage="Arşiv yüklenemedi"
    >
      {!archive.allowed ? (
        <Stack gap="lg" align="center" style={{ paddingVertical: theme.spacing.xl }}>
          <EmptyState
            icon="lock-closed-outline"
            title="Belge arşivi Plus'ta"
            message="Ödemelere dekont, fotoğraf veya PDF ekleyin; hepsi burada saklanır ve tek dokunuşla açılır."
          />
          <Button label="Planları gör" onPress={() => router.push('/paywall')} />
        </Stack>
      ) : (
        <Stack gap="lg">
          <TextField
            placeholder="Kişi, firma veya kayıt ara"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {sections.length === 0 ? (
            <EmptyState
              icon="folder-open-outline"
              title={search ? 'Sonuç yok' : 'Henüz dekont yok'}
              message={
                search
                  ? 'Aramanıza uyan dekont bulunamadı.'
                  : 'Bir ödeme eklerken dekont ekleyin ya da dekontu tarayın; burada görünsün.'
              }
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
