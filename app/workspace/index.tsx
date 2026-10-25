import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, Group, GroupedRow, GroupedRowIcon, Pressable, Row, Stack, Tag, Text, TextField } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useSession } from '@/features/auth/useSession';
import { deleteWorkspace, listMyWorkspaces, updateWorkspaceName, type Workspace } from '@/features/workspaces/api';
import { isWorkspaceReadOnly, setPrimaryWorkspace } from '@/features/subscriptions/api';
import { usePlanEnforcement } from '@/features/subscriptions/usePlanEnforcement';
import { PlanLimitBanner } from '@/components/subscription/PlanLimitBanner';
import { queryKeys } from '@/services/queryKeys';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { showErrorAlert, friendlyErrorMessage } from '@/utils/alerts';
import { t } from '@/i18n';

function workspaceInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toLocaleUpperCase('tr-TR');
  return name.trim().slice(0, 2).toLocaleUpperCase('tr-TR');
}

// Ayarlar'daki "Çalışma Alanları" satırından açılır: tüm çalışma alanlarını listeler, aralarında
// geçiş (aktif çalışma alanını değiştirme), davet koduyla yeni birine katılma ve yeni çalışma
// alanı oluşturma tek ekranda toplanır. Sahip olunan çalışma alanları için ad değiştirme/silme de
// burada — Profil'deki eski satır içi liste ile aynı mantığın tekilleştirilmiş hali (bkz.
// app/profile, orada artık bu ekrana yönlendiren tek bir satır var).
export default function WorkspacesScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspaceStore();
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces(),
    queryFn: listMyWorkspaces,
  });

  // Plan durumu (limit aşımı, lütuf süresi, kilit) — bu ekran limitin en görünür olduğu
  // yerdir, bu yüzden uyarı bandı ve birincil alan seçimi burada toplanır.
  const planQuery = usePlanEnforcement();
  const planState = planQuery.data ?? null;
  const atWorkspaceLimit = !!planState && planState.workspaceCount >= planState.workspaceLimit;
  const [choosingPrimary, setChoosingPrimary] = useState(false);

  const primaryMutation = useMutation({
    mutationFn: (id: string) => setPrimaryWorkspace(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.planEnforcement() });
      setChoosingPrimary(false);
    },
    onError: (error) => showErrorAlert(error),
  });

  const renameMutation = useMutation({
    mutationFn: (vars: { id: string; name: string }) => updateWorkspaceName(vars.id, vars.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
      setEditingWorkspaceId(null);
    },
    onError: (error) => Alert.alert(t('workspace.saveFailedTitle'), friendlyErrorMessage(error, t('workspace.genericError'))),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWorkspace(id),
    onSuccess: (_data, id) => {
      if (activeWorkspaceId === id) setActiveWorkspaceId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
    },
    onError: (error) => Alert.alert(t('workspace.deleteFailedTitle'), friendlyErrorMessage(error, t('workspace.genericError'))),
  });

  function startEditing(workspace: Workspace) {
    setEditingWorkspaceId(workspace.id);
    setNameDraft(workspace.name);
  }

  function confirmDelete(workspace: Workspace) {
    Alert.alert(
      t('workspace.deleteTitle', { name: workspace.name }),
      t('workspace.deleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(t('workspace.deleteSureTitle'), t('workspace.deleteSureBody'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('workspace.deletePermanent'), style: 'destructive', onPress: () => deleteMutation.mutate(workspace.id) },
            ]);
          },
        },
      ]
    );
  }

  const workspaces = workspacesQuery.data ?? [];
  const isEmpty = workspacesQuery.isSuccess && workspaces.length === 0;

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader title={t('workspace.list.title')} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <PlanLimitBanner
          state={planState}
          onChoosePrimary={planState?.overLimit ? () => setChoosingPrimary((v) => !v) : undefined}
        />

        {choosingPrimary ? (
          <Text variant="caption" color="textSecondary">
            {t('workspace.list.choosePrimaryHint')}
          </Text>
        ) : null}

        {isEmpty ? (
          <Text variant="body" color="textSecondary">
            {t('workspace.list.empty')}
          </Text>
        ) : (
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary" style={{ paddingHorizontal: theme.spacing.xxs }}>
              {t('workspace.list.isolationNote')}
            </Text>
            <Group inset={62}>
                {workspaces.map((w) => {
                  const isOwner = w.owner_id === session?.user?.id;
                  const isActive = w.id === activeWorkspaceId;
                  const isPrimary = w.id === planState?.primaryWorkspaceId;
                  const readOnly = isWorkspaceReadOnly(planState, w.id);

                  if (editingWorkspaceId === w.id) {
                    return (
                      <Stack key={w.id} gap="sm" style={{ padding: theme.spacing.md }}>
                        <TextField placeholder={t('workspace.namePlaceholder')} value={nameDraft} onChangeText={setNameDraft} autoFocus />
                        <Row gap="sm">
                          <View style={{ flex: 1 }}>
                            <Button
                              label={t('common.save')}
                              onPress={() => renameMutation.mutate({ id: w.id, name: nameDraft.trim() })}
                              loading={renameMutation.isPending}
                              disabled={!nameDraft.trim()}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Button label={t('common.cancel')} variant="secondary" onPress={() => setEditingWorkspaceId(null)} />
                          </View>
                        </Row>
                      </Stack>
                    );
                  }

                  return (
                    <Pressable
                      key={w.id}
                      onPress={() =>
                        choosingPrimary && isOwner ? primaryMutation.mutate(w.id) : setActiveWorkspaceId(w.id)
                      }
                    >
                      <Row gap="sm" align="center" style={{ paddingHorizontal: theme.spacing.md, paddingVertical: 10, minHeight: 56 }}>
                        <GroupedRowIcon name={w.type === 'business' ? 'briefcase' : 'person'} tone={isActive ? 'brand' : 'default'} />
                        <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ fontWeight: isActive ? '600' : '500' }}>
                            {w.name}
                          </Text>
                          <Text variant="caption" color={readOnly ? 'danger' : 'textSecondary'} numberOfLines={1}>
                            {w.type === 'business' ? t('workspace.business') : t('workspace.personal')}
                            {readOnly ? t('workspace.list.readOnly') : ''}
                            {planState?.overLimit && isPrimary ? t('workspace.list.primary') : ''}
                          </Text>
                        </Stack>
                        {isOwner ? (
                          <Text color="textSecondary" style={{ fontSize: 15 }}>
                            {t('workspace.list.owner')}
                          </Text>
                        ) : null}
                        <Pressable
                          accessibilityLabel={t('workspace.list.team')}
                          hitSlop={8}
                          onPress={() => router.push({ pathname: '/workspace/[id]/members', params: { id: w.id } })}
                        >
                          <Ionicons name="people-outline" size={18} color={theme.colors.textPrimary} />
                        </Pressable>
                        {isOwner ? (
                          <>
                            <Pressable accessibilityLabel={t('workspace.list.rename')} hitSlop={8} onPress={() => startEditing(w)}>
                              <Ionicons name="pencil" size={16} color={theme.colors.textSecondary} />
                            </Pressable>
                            <Pressable accessibilityLabel={t('workspace.list.delete')} hitSlop={8} onPress={() => confirmDelete(w)}>
                              <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                            </Pressable>
                          </>
                        ) : null}
                        <View style={{ width: 18, alignItems: 'center' }}>
                          {isActive ? <Ionicons name="checkmark" size={18} color={theme.colors.attentionMarker} /> : null}
                        </View>
                      </Row>
                    </Pressable>
                  );
                })}
            </Group>
          </Stack>
        )}

        <Stack gap="xs">
          <Group inset={62}>
            {activeWorkspaceId ? (
              <GroupedRow
                leading={<GroupedRowIcon name="people" />}
                title={t('workspace.list.manageTeam')}
                onPress={() => router.push({ pathname: '/workspace/[id]/members', params: { id: activeWorkspaceId } })}
              />
            ) : null}
            <GroupedRow
              leading={<GroupedRowIcon name="enter" />}
              title={t('workspace.list.joinWithCode')}
              onPress={() => router.push('/workspace/join')}
            />
            {/* Limit dolduğunda satır gizlenmez — kullanıcı neden oluşturamadığını görmeli ve
                doğrudan planlara gidebilmeli. Sunucu tarafında da ayrıca engellenir
                (enforce_workspace_plan_limit trigger'ı). */}
            <GroupedRow
              leading={<GroupedRowIcon name={atWorkspaceLimit ? 'lock-closed' : 'add'} />}
              title={atWorkspaceLimit ? t('workspace.list.upgradeForNew') : t('workspace.list.newWorkspace')}
              trailing={atWorkspaceLimit ? <Tag tone="brand" label="Plus" /> : undefined}
              onPress={() =>
                atWorkspaceLimit
                  ? router.push('/paywall')
                  : router.push({ pathname: '/workspace-setup', params: { step: 'create' } })
              }
            />
          </Group>
          {atWorkspaceLimit ? (
            <Text variant="caption" color="textSecondary" style={{ paddingHorizontal: 4 }}>
              {planState?.plan === 'free'
                ? t('workspace.list.freeLimit', { count: planState.workspaceLimit })
                : t('workspace.list.planLimit', { count: planState?.workspaceLimit ?? 0 })}
            </Text>
          ) : null}
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}
