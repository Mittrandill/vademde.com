import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Row, Stack } from './Stack';
import { Text } from './Text';
import { TextField } from './TextField';

// docs/08-tasarim-sistemi.md §12.16 — büyüyebilecek liste alanları (hesap, kategori,
// kişi/firma vb.) yazarak arama + ikonlu seçici ile sunulur.
export interface SearchablePickerProps<T extends { id: string; name: string }> {
  items: T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  getIcon?: (item: T) => keyof typeof Ionicons.glyphMap;
  /** Ionicons yerine özel bir görsel (ör. banka logosu) göstermek için kullanılır; verilirse getIcon'a öncelikli. */
  renderLeading?: (item: T) => ReactNode;
  placeholder?: string;
  title?: string;
  emptyLabel?: string;
  /** Verilirse, aramada tam eşleşme yoksa listenin başında "Yeni ekle" satırı gösterilir. */
  onCreateNew?: (name: string) => Promise<void> | void;
}

const FALLBACK_ICON: keyof typeof Ionicons.glyphMap = 'pricetag-outline';

export function SearchablePicker<T extends { id: string; name: string }>({
  items,
  selectedId,
  onSelect,
  getIcon,
  renderLeading,
  placeholder = 'Seçin',
  title = 'Seçin',
  emptyLabel = 'Eşleşen sonuç bulunamadı.',
  onCreateNew,
}: SearchablePickerProps<T>) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const iconFor = (item: T) => getIcon?.(item) ?? FALLBACK_ICON;

  const trimmedSearch = search.trim();
  const filtered = useMemo(() => {
    const query = trimmedSearch.toLocaleLowerCase('tr-TR');
    if (!query) return items;
    return items.filter((item) => item.name.toLocaleLowerCase('tr-TR').includes(query));
  }, [items, trimmedSearch]);

  const showCreateRow =
    !!onCreateNew &&
    trimmedSearch.length > 0 &&
    !items.some((item) => item.name.toLocaleLowerCase('tr-TR') === trimmedSearch.toLocaleLowerCase('tr-TR'));

  async function handleCreateNew() {
    if (!onCreateNew || creating) return;
    setCreating(true);
    try {
      await onCreateNew(trimmedSearch);
      setSearch('');
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
          paddingHorizontal: theme.spacing.md,
          height: theme.buttonHeight.primary,
          borderRadius: theme.radius.input,
          backgroundColor: theme.colors.surfacePrimary,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        {selected && renderLeading ? (
          renderLeading(selected)
        ) : (
          <Ionicons
            name={selected ? iconFor(selected) : FALLBACK_ICON}
            size={20}
            color={selected ? theme.colors.accentViolet : theme.colors.textSecondary}
          />
        )}
        <Text
          variant="body"
          style={{ flex: 1, color: selected ? theme.colors.textPrimary : theme.colors.textSecondary }}
        >
          {selected ? selected.name : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={theme.colors.textSecondary} />
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
          <Stack gap="md" style={{ flex: 1, paddingTop: theme.spacing.md }}>
            <Row style={{ paddingHorizontal: theme.screenEdge.standard }} align="center">
              <Text variant="pageTitle" style={{ flex: 1 }}>
                {title}
              </Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
              </Pressable>
            </Row>

            <Stack style={{ paddingHorizontal: theme.screenEdge.standard }}>
              <TextField
                placeholder="Ara..."
                value={search}
                onChangeText={setSearch}
                autoFocus
                autoCapitalize="none"
              />
            </Stack>

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{
                paddingHorizontal: theme.screenEdge.standard,
                gap: theme.spacing.xs,
                paddingBottom: theme.spacing.xxl,
              }}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                showCreateRow ? (
                  <Pressable
                    onPress={handleCreateNew}
                    disabled={creating}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                      padding: theme.spacing.md,
                      borderRadius: theme.radius.widget,
                      backgroundColor: theme.colors.surfaceElevated,
                      marginBottom: theme.spacing.xs,
                      opacity: creating ? 0.6 : 1,
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={theme.colors.brandPrimary} />
                    <Text variant="body" style={{ color: theme.colors.brandPrimary }}>
                      {creating ? 'Ekleniyor...' : `"${trimmedSearch}" ekle`}
                    </Text>
                  </Pressable>
                ) : null
              }
              ListEmptyComponent={
                <Text variant="body" color="textSecondary" style={{ paddingTop: theme.spacing.lg }}>
                  {emptyLabel}
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onSelect(item.id);
                    setSearch('');
                    setOpen(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                    padding: theme.spacing.md,
                    borderRadius: theme.radius.widget,
                    backgroundColor:
                      item.id === selectedId ? theme.colors.brandPrimary : theme.colors.surfacePrimary,
                  }}
                >
                  {renderLeading ? (
                    renderLeading(item)
                  ) : (
                    <Ionicons
                      name={iconFor(item)}
                      size={20}
                      color={item.id === selectedId ? theme.colors.brandPrimaryText : theme.colors.accentViolet}
                    />
                  )}
                  <Text
                    variant="body"
                    style={{
                      color: item.id === selectedId ? theme.colors.brandPrimaryText : theme.colors.textPrimary,
                    }}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              )}
            />
          </Stack>
        </SafeAreaView>
      </Modal>
    </>
  );
}
