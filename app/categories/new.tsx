import { useMemo, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useExitGuard } from '@/utils/useExitGuard';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useReflowKey } from '@/services/reflow';
import { withAlpha } from '@/theme/colors';
import { Button, FieldGroup, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { CategoryIcon } from '@/components/finance/CategoryIcon';
import {
  createCategory,
  deleteCategory,
  getCategory,
  updateCategory,
  type Category,
} from '@/features/categories/api';
import { CATEGORY_ICON_CHOICES, CATEGORY_COLOR_PALETTE, getSuggestedColorForIcon } from '@/features/categories/categoryIcons';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { showSaveSuccess, showErrorAlert, friendlyErrorMessage } from '@/utils/alerts';
import { matchesSearch, normalizeForSearch } from '@/utils/search';
import { t } from '@/i18n';

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

type Kind = 'income' | 'expense';

const KINDS: Array<{ value: Kind; readonly label: string }> = [
  { value: 'expense', get label() { return t('categories.form.expense'); } },
  { value: 'income', get label() { return t('categories.form.income'); } },
];

export default function NewCategoryScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const existingQuery = useQuery({
    queryKey: ['category', id],
    queryFn: () => getCategory(id as string),
    enabled: isEditing,
  });

  if (isEditing && !existingQuery.data) {
    return (
      <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          {existingQuery.error ? (
            <Text variant="body" color="danger">
              {friendlyErrorMessage(existingQuery.error, t('categories.form.loadFailed'))}
            </Text>
          ) : null}
        </Stack>
      </SafeAreaView>
    );
  }

  return <CategoryForm key={reflowKey} id={isEditing ? (id as string) : null} initial={existingQuery.data ?? null} />;
}

function CategoryForm({ id, initial }: { id: string | null; initial: Category | null }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const isEditing = !!id;

  const [name, setName] = useState(initial?.name ?? '');
  const { allowExit } = useExitGuard(!isEditing && name.trim() !== '');
  const [kind, setKind] = useState<Kind>((initial?.kind as Kind) ?? 'expense');
  const [icon, setIcon] = useState<string>(initial?.icon ?? CATEGORY_ICON_CHOICES[0].icon);
  const [color, setColor] = useState<string>(initial?.color ?? getSuggestedColorForIcon(initial?.icon ?? CATEGORY_ICON_CHOICES[0].icon));
  const [hexInput, setHexInput] = useState(color);
  const [iconSearch, setIconSearch] = useState('');

  const filteredIcons = useMemo(() => {
    const query = normalizeForSearch(iconSearch);
    return CATEGORY_ICON_CHOICES.filter((option) => matchesSearch(option.label, query));
  }, [iconSearch]);

  function applyColor(next: string) {
    setColor(next);
    setHexInput(next);
  }

  const hexError = hexInput && !HEX_COLOR_PATTERN.test(hexInput) ? t('categories.form.hexError') : undefined;

  function invalidate() {
    if (activeWorkspaceId) {
      queryClient.invalidateQueries({ queryKey: [activeWorkspaceId, 'categories'] });
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeWorkspaceId || !name.trim()) throw new Error(t('categories.form.nameRequired'));
      if (isEditing) {
        return updateCategory(id, { name: name.trim(), kind, icon, color });
      }
      return createCategory({ workspace_id: activeWorkspaceId, name: name.trim(), kind, icon, color });
    },
    onSuccess: () => {
      allowExit();
      showSaveSuccess(
        isEditing ? t('categories.form.updated') : t('categories.form.created'),
        () => router.back(),
        invalidate
      );
    },
    onError: (error) => showErrorAlert(error),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCategory(id as string),
    onSuccess: () => {
      showSaveSuccess(t('categories.form.deleted'), () => router.back(), invalidate);
    },
    onError: () => {
      Alert.alert(
        t('categories.form.deleteFailedTitle'),
        t('categories.form.deleteFailedBody')
      );
    },
  });

  function confirmDelete() {
    Alert.alert(t('categories.form.deleteTitle'), t('categories.form.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard }}>
        <Stack gap="lg">
          <ScreenHeader
            inline
            title={isEditing ? t('categories.form.editTitle') : t('categories.form.newTitle')}
            leftLabel={{ label: t('common.cancel'), onPress: () => router.back() }}
            rightLabel={{
              label: isEditing ? t('categories.form.update') : t('common.save'),
              bold: true,
              disabled: !name.trim() || saveMutation.isPending,
              onPress: () => saveMutation.mutate(),
            }}
          />

          <SegmentedControl
            options={KINDS.map((k) => ({ key: k.value, label: k.label }))}
            value={kind}
            onChange={setKind}
            stretch
          />

          <FieldGroup>
            <TextField label={t('categories.form.name')} placeholder={t('categories.form.namePlaceholder')} value={name} onChangeText={setName} />
          </FieldGroup>

          <Row gap="sm" align="center">
            <CategoryIcon icon={icon} color={color} size={56} />
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="cardTitle">{CATEGORY_ICON_CHOICES.find((o) => o.icon === icon)?.label ?? t('categories.form.icon')}</Text>
              <Text variant="caption" color="textSecondary">
                {t('categories.form.iconHint')}
              </Text>
            </Stack>
          </Row>

          <Stack gap="sm">
            <Text variant="label" color="textSecondary">
              {t('categories.form.iconsUpper', { count: CATEGORY_ICON_CHOICES.length })}
            </Text>
            <TextField
              placeholder={t('categories.form.iconSearch')}
              value={iconSearch}
              onChangeText={setIconSearch}
              autoCorrect={false}
              returnKeyType="search"
            />
            <Row gap="sm" style={{ flexWrap: 'wrap' }}>
              {filteredIcons.map((option) => {
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
                      backgroundColor: selected ? color : theme.colors.fill,
                    }}
                  >
                    <Ionicons name={option.icon} size={20} color={selected ? '#FFFFFF' : theme.colors.textSecondary} />
                  </Pressable>
                );
              })}
              {filteredIcons.length === 0 ? (
                <Text variant="caption" color="textSecondary">
                  {t('categories.form.noIcon')}
                </Text>
              ) : null}
            </Row>
          </Stack>

          <Stack gap="sm">
            <Text variant="label" color="textSecondary">
              {t('categories.form.colorUpper')}
            </Text>
            <Row gap="sm" style={{ flexWrap: 'wrap' }}>
              {CATEGORY_COLOR_PALETTE.map((swatch) => {
                const selected = swatch.toLowerCase() === color.toLowerCase();
                return (
                  <Pressable
                    key={swatch}
                    accessibilityLabel={swatch}
                    onPress={() => applyColor(swatch)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: theme.radius.pill,
                      backgroundColor: swatch,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: selected ? 3 : 0,
                      borderColor: withAlpha(theme.colors.textPrimary, 0.4),
                    }}
                  >
                    {selected ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                  </Pressable>
                );
              })}
            </Row>
            <TextField
              label={t('categories.form.customColor')}
              placeholder="#3FB27F"
              value={hexInput}
              onChangeText={(value) => {
                setHexInput(value);
                if (HEX_COLOR_PATTERN.test(value)) setColor(value);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              error={hexError}
            />
          </Stack>

          {saveMutation.error ? (
            <Text variant="caption" color="danger">
              {friendlyErrorMessage(saveMutation.error, t('categories.form.saveFailed'))}
            </Text>
          ) : null}

          {isEditing ? (
            <Button
              label={t('categories.form.delete')}
              variant="dangerText"
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
