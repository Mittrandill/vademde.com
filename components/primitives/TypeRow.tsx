import { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { MAX_FONT_SCALE } from '@/theme/typography';
import { BottomSheet } from './BottomSheet';
import { FormRow } from './FormRow';
import { Pressable } from './Pressable';
import { Text } from './Text';

export interface TypeOption {
  id: string;
  name: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export interface TypeGroup {
  title: string;
  items: TypeOption[];
}

export interface TypeRowProps {
  label: string;
  groups: TypeGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
  sheetTitle?: string;
  searchPlaceholder?: string;
}

// Türkçe büyük/küçük harf farkını (İ/I, ı/i) aramada yok sayar.
function normalize(text: string): string {
  return text.toLocaleLowerCase('tr-TR').replace(/̇/g, '').replace(/ı/g, 'i');
}

// HANDOFF §3 — tür seçimi ızgara değil: tek satır + gruplu, aramalı liste (SearchablePicker sheet).
export function TypeRow({
  label,
  groups,
  selectedId,
  onSelect,
  placeholder = 'Seç',
  sheetTitle,
  searchPlaceholder = 'Ara',
}: TypeRowProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => groups.flatMap((g) => g.items).find((item) => item.id === selectedId) ?? null,
    [groups, selectedId]
  );

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => normalize(i.name).includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <FormRow
        label={label}
        value={selected?.name}
        placeholder={placeholder}
        icon={selected?.icon}
        onPress={() => setOpen(true)}
      />
      <BottomSheet visible={open} onClose={close} title={sheetTitle ?? label}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
            height: theme.touchTarget.minimum,
            paddingHorizontal: theme.spacing.sm,
            borderRadius: theme.radius.input,
            backgroundColor: theme.colors.backgroundPrimary,
            marginBottom: theme.spacing.sm,
          }}
        >
          <Ionicons name="search" size={theme.iconSize.lg} color={theme.colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={theme.colors.textSecondary}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            autoCorrect={false}
            style={[theme.typography.body, { flex: 1, color: theme.colors.textPrimary, padding: 0 }]}
          />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
          {filtered.length === 0 ? (
            <Text color="textSecondary" style={{ paddingVertical: theme.spacing.lg, textAlign: 'center' }}>
              Sonuç bulunamadı
            </Text>
          ) : null}
          {filtered.map((group) => (
            <View key={group.title} style={{ marginBottom: theme.spacing.xs }}>
              <Text variant="label" color="textSecondary" style={{ paddingVertical: theme.spacing.xs }}>
                {group.title}
              </Text>
              {group.items.map((item) => {
                const active = item.id === selectedId;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      onSelect(item.id);
                      close();
                    }}
                    style={{
                      minHeight: theme.touchTarget.minimum + 4,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                    }}
                  >
                    {item.icon ? (
                      <Ionicons name={item.icon} size={theme.iconSize.xl} color={theme.colors.textPrimary} />
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <Text variant="cardTitle" numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.description ? (
                        <Text variant="caption" color="textSecondary" numberOfLines={1}>
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name={active ? 'radio-button-on' : 'radio-button-off'}
                      size={theme.iconSize.xl}
                      color={active ? theme.colors.action : theme.colors.mutedControl}
                    />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </BottomSheet>
    </>
  );
}
