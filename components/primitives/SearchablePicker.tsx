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
          minHeight: theme.buttonHeight.primary,
          borderRadius: 16,
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
            color={selected ? theme.colors.textPrimary : theme.colors.textSecondary}
          />
        )}
        <Text
          variant="cardTitle"
          numberOfLines={1}
          style={{ flex: 1, color: selected ? theme.colors.textPrimary : theme.colors.textSecondary }}
        >
          {selected ? selected.name : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={theme.colors.mutedControl} />
      </Pressable>

      {/* Modal yalnızca açıkken mount edilir — bkz. DateField'daki aynı not. Bu seçici
          liste satırlarında tekrarlanabiliyor (ör. kredi kartı ekstresini kategorilere
          ayırırken her işlem satırı için bir CategoryPicker); pageSheet sunum stili
          iOS'ta her örnek için ayrı bir UIViewController açtığından, kapalı modalları
          ağaçta tutmak onlarca satırlık ekstrelerde uygulamayı çökertiyordu. */}
      {open ? (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
          <Stack gap="md" style={{ flex: 1, paddingTop: theme.spacing.md }}>
            <Row style={{ paddingHorizontal: theme.screenEdge.standard }} align="center">
              <Text variant="sectionTitle" style={{ flex: 1 }}>
                {title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Kapat"
                onPress={() => setOpen(false)}
                style={{
                  width: theme.touchTarget.minimum,
                  height: theme.touchTarget.minimum,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.surfacePrimary,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
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
                      minHeight: 56,
                      paddingHorizontal: theme.spacing.md,
                      borderRadius: theme.radius.widget,
                      backgroundColor: theme.colors.surfacePrimary,
                      marginBottom: theme.spacing.xs,
                      opacity: creating ? 0.6 : 1,
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={theme.colors.textPrimary} />
                    <Text variant="body" style={{ color: theme.colors.textPrimary }}>
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
              renderItem={({ item }) => {
                const active = item.id === selectedId;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      onSelect(item.id);
                      setSearch('');
                      setOpen(false);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                      minHeight: 60,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border,
                    }}
                  >
                    {renderLeading ? (
                      renderLeading(item)
                    ) : (
                      <Ionicons name={iconFor(item)} size={22} color={theme.colors.textPrimary} />
                    )}
                    <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
                      {item.name}
                    </Text>
                    <Ionicons
                      name={active ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={active ? theme.colors.action : theme.colors.mutedControl}
                    />
                  </Pressable>
                );
              }}
            />
          </Stack>
        </SafeAreaView>
      </Modal>
      ) : null}
    </>
  );
}
