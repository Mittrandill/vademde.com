import { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Button, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import {
  createCategory,
  deleteCategory,
  getCategory,
  updateCategory,
  type Category,
} from '@/features/categories/api';
import { CATEGORY_ICON_OPTIONS } from '@/features/categories/categoryIcons';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { showSuccessAlert } from '@/utils/alerts';

type Kind = 'income' | 'expense';

const KINDS: Array<{ value: Kind; label: string }> = [
  { value: 'expense', label: 'Gider' },
  { value: 'income', label: 'Gelir' },
];

export default function NewCategoryScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const existingQuery = useQuery({
    queryKey: ['category', id],
    queryFn: () => getCategory(id as string),
    enabled: isEditing,
  });

  if (isEditing && !existingQuery.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          {existingQuery.error ? (
            <Text variant="body" color="danger">
              {existingQuery.error instanceof Error ? existingQuery.error.message : 'Kategori yüklenemedi'}
            </Text>
          ) : null}
        </Stack>
      </SafeAreaView>
    );
  }

  return <CategoryForm id={isEditing ? (id as string) : null} initial={existingQuery.data ?? null} />;
}

function CategoryForm({ id, initial }: { id: string | null; initial: Category | null }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const isEditing = !!id;

  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<Kind>((initial?.kind as Kind) ?? 'expense');
  const [icon, setIcon] = useState<string>(initial?.icon ?? CATEGORY_ICON_OPTIONS[0].icon);

  function invalidate() {
    if (activeWorkspaceId) {
      queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'categories'] });
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !name.trim()) throw new Error('Kategori adı zorunlu');
      if (isEditing) {
        return updateCategory(id, { name: name.trim(), kind, icon });
      }
      return createCategory({ workspace_id: activeWorkspaceId, name: name.trim(), kind, icon });
    },
    onSuccess: () => {
      invalidate();
      showSuccessAlert(isEditing ? 'Kategori başarıyla güncellendi.' : 'Kategori başarıyla oluşturuldu.', () =>
        router.back()
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCategory(id as string),
    onSuccess: () => {
      invalidate();
      showSuccessAlert('Kategori başarıyla silindi.', () => router.back());
    },
    onError: () => {
      Alert.alert(
        'Silinemedi',
        'Bu kategori işlem veya borç/alacak kayıtlarında kullanılıyor. Önce ilişkili kayıtları güncelleyin.'
      );
    },
  });

  function confirmDelete() {
    Alert.alert('Kategoriyi Sil', 'Bu kategori kalıcı olarak silinecek. Emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard }}>
        <Stack gap="lg">
          <Row align="center">
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
            </Pressable>
            <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
              {isEditing ? 'Kategoriyi Düzenle' : 'Yeni Kategori'}
            </Text>
          </Row>

          <SegmentedControl
            options={KINDS.map((k) => ({ key: k.value, label: k.label }))}
            value={kind}
            onChange={setKind}
            stretch
          />

          <TextField label="AD" placeholder="Örn. Ulaşım" value={name} onChangeText={setName} />

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              SİMGE
            </Text>
            <Row gap="sm" style={{ flexWrap: 'wrap' }}>
              {CATEGORY_ICON_OPTIONS.map((option) => {
                const selected = option.icon === icon;
                return (
                  <Pressable
                    key={option.icon}
                    accessibilityLabel={option.label}
                    onPress={() => setIcon(option.icon)}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: theme.radius.input,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? option.color : withAlpha(option.color, 0.14),
                    }}
                  >
                    <Ionicons name={option.icon} size={20} color={selected ? '#FFFFFF' : option.color} />
                  </Pressable>
                );
              })}
            </Row>
          </Stack>

          {saveMutation.error ? (
            <Text variant="caption" color="danger">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'Kategori kaydedilemedi'}
            </Text>
          ) : null}

          <Button
            label={isEditing ? 'Güncelle' : 'Kaydet'}
            onPress={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={!name.trim()}
          />

          {isEditing ? (
            <Button
              label="Sil"
              variant="danger"
              onPress={confirmDelete}
              loading={deleteMutation.isPending}
              disabled={saveMutation.isPending}
            />
          ) : null}
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}
