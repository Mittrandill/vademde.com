import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Modal, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { FieldShell } from './FormRow';
import { Text } from './Text';

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
  /** Satırın sağında ikincil renkte küçük etiket (tuval: "Kategori", "Hesap"). */
  label?: string;
  title?: string;
  emptyLabel?: string;
  /** Verilirse, aramada tam eşleşme yoksa listenin başında "Yeni ekle" satırı gösterilir. */
  onCreateNew?: (name: string) => Promise<void> | void;
}

function highlight(name: string, query: string): ReactNode {
  if (!query) return name;
  const at = name.toLocaleLowerCase('tr-TR').indexOf(query.toLocaleLowerCase('tr-TR'));
  if (at < 0) return name;
  return (
    <>
      {name.slice(0, at)}
      <Text style={{ fontWeight: '700' }}>{name.slice(at, at + query.length)}</Text>
      {name.slice(at + query.length)}
    </>
  );
}

const FALLBACK_ICON: keyof typeof Ionicons.glyphMap = 'pricetag-outline';

export function SearchablePicker<T extends { id: string; name: string }>({
  items,
  selectedId,
  onSelect,
  getIcon,
  renderLeading,
  placeholder = 'Seçin',
  label,
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
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
        <FieldShell>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: 10,
              minHeight: 56,
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
            <Text numberOfLines={1} style={{ flex: 1, color: selected ? theme.colors.textPrimary : theme.colors.mutedControl }}>
              {selected ? selected.name : placeholder}
            </Text>
            {label && selected ? (
              <Text variant="caption" color="textSecondary">
                {label}
              </Text>
            ) : null}
            <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
          </View>
        </FieldShell>
      </Pressable>

      {/* Modal yalnızca açıkken mount edilir — bkz. DateField'daki aynı not. Bu seçici
          liste satırlarında tekrarlanabiliyor (ör. kredi kartı ekstresini kategorilere
          ayırırken her işlem satırı için bir CategoryPicker); pageSheet sunum stili
          iOS'ta her örnek için ayrı bir UIViewController açtığından, kapalı modalları
          ağaçta tutmak onlarca satırlık ekstrelerde uygulamayı çökertiyordu. */}
      {open ? (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
          <View style={{ flex: 1, paddingTop: theme.spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.screenEdge.standard, minHeight: 44 }}>
              <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 }}>{title}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Kapat"
                onPress={() => setOpen(false)}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.fill }}
              >
                <Ionicons name="close" size={18} color={theme.colors.textPrimary} />
              </Pressable>
            </View>

            <View style={{ paddingHorizontal: theme.screenEdge.standard, marginTop: theme.spacing.sm }}>
              <View
                style={{
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: theme.colors.fill,
                  borderWidth: 1.5,
                  borderColor: theme.colors.brandPrimary,
                  paddingHorizontal: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Ionicons name="search" size={17} color={theme.colors.textSecondary} />
                <TextInput
                  placeholder="Ara"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={search}
                  onChangeText={setSearch}
                  autoFocus
                  autoCapitalize="none"
                  selectionColor={theme.colors.brandPrimary}
                  style={{ flex: 1, fontSize: 17, color: theme.colors.textPrimary, padding: 0 }}
                />
              </View>
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{
                paddingHorizontal: theme.screenEdge.standard,
                paddingTop: theme.spacing.md,
                paddingBottom: theme.spacing.xxl,
              }}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <>
                {trimmedSearch ? (
                  <Text variant="caption" color="textSecondary" style={{ textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: theme.spacing.xs, marginLeft: 4 }}>
                    {filtered.length} sonuç
                  </Text>
                ) : null}
                {showCreateRow ? (
                  <Pressable
                    onPress={handleCreateNew}
                    disabled={creating}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      minHeight: 56,
                      paddingHorizontal: theme.spacing.md,
                      borderRadius: theme.radius.group,
                      backgroundColor: theme.colors.surfacePrimary,
                      marginBottom: theme.spacing.xs,
                      opacity: creating ? 0.6 : 1,
                    }}
                  >
                    <Ionicons name="add-circle" size={22} color={theme.colors.textPrimary} />
                    <Text style={{ fontWeight: '500' }}>{creating ? 'Ekleniyor...' : `"${trimmedSearch}" ekle`}</Text>
                  </Pressable>
                ) : null}
                </>
              }
              ListEmptyComponent={
                <Text color="textSecondary" style={{ paddingTop: theme.spacing.lg }}>
                  {emptyLabel}
                </Text>
              }
              ItemSeparatorComponent={() => (
                <View style={{ height: 1, marginLeft: 62, backgroundColor: theme.colors.separator }} />
              )}
              renderItem={({ item, index }) => {
                const active = item.id === selectedId;
                return (
                  <View
                    style={{
                      backgroundColor: theme.colors.surfacePrimary,
                      borderTopLeftRadius: index === 0 ? theme.radius.group : 0,
                      borderTopRightRadius: index === 0 ? theme.radius.group : 0,
                      borderBottomLeftRadius: index === filtered.length - 1 ? theme.radius.group : 0,
                      borderBottomRightRadius: index === filtered.length - 1 ? theme.radius.group : 0,
                      overflow: 'hidden',
                    }}
                  >
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        onSelect(item.id);
                        setSearch('');
                        setOpen(false);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: theme.spacing.md }}
                    >
                      {renderLeading ? (
                        renderLeading(item)
                      ) : (
                        <Ionicons name={iconFor(item)} size={22} color={theme.colors.textPrimary} />
                      )}
                      <Text numberOfLines={1} style={{ flex: 1, fontWeight: active ? '600' : '400' }}>
                        {highlight(item.name, trimmedSearch)}
                      </Text>
                      {active ? <Ionicons name="checkmark" size={20} color={theme.colors.attentionMarker} /> : null}
                    </Pressable>
                  </View>
                );
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>
      ) : null}
    </>
  );
}
