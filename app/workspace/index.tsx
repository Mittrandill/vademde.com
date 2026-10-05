import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, Pressable, Row, Stack, Text, TextField } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useSession } from '@/features/auth/useSession';
import { deleteWorkspace, listMyWorkspaces, updateWorkspaceName, type Workspace } from '@/features/workspaces/api';
import { isWorkspaceReadOnly, setPrimaryWorkspace } from '@/features/subscriptions/api';
import { usePlanEnforcement } from '@/features/subscriptions/usePlanEnforcement';
import { PlanLimitBanner } from '@/components/subscription/PlanLimitBanner';
import { queryKeys } from '@/services/queryKeys';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { showErrorAlert } from '@/utils/alerts';

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
    onError: (error) => Alert.alert('Kaydedilemedi', error instanceof Error ? error.message : 'Bir hata oluştu'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWorkspace(id),
    onSuccess: (_data, id) => {
      if (activeWorkspaceId === id) setActiveWorkspaceId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
    },
    onError: (error) => Alert.alert('Silinemedi', error instanceof Error ? error.message : 'Bir hata oluştu'),
  });

  function startEditing(workspace: Workspace) {
    setEditingWorkspaceId(workspace.id);
    setNameDraft(workspace.name);
  }

  function confirmDelete(workspace: Workspace) {
    Alert.alert(
      `"${workspace.name}" çalışma alanını sil`,
      'Bu işlem geri alınamaz. Bu çalışma alanındaki tüm hesaplar, işlemler, borç/alacak kayıtları ve belgeler kalıcı olarak silinecek.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Emin misin?', 'Bu son bir uyarıdır. Bu veriler kurtarılamaz.', [
              { text: 'Vazgeç', style: 'cancel' },
              { text: 'Kalıcı Olarak Sil', style: 'destructive', onPress: () => deleteMutation.mutate(workspace.id) },
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
        <ScreenHeader title="Çalışma Alanları" />
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
            Aktif kalacak çalışma alanını seçmek için aşağıdaki listeden bir alana dokunun.
          </Text>
        ) : null}

        {isEmpty ? (
          <Text variant="body" color="textSecondary">
            Henüz bir çalışma alanın yok. Yeni bir tane oluştur veya davet koduyla mevcut birine katıl.
          </Text>
        ) : (
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary" style={{ paddingHorizontal: theme.spacing.xxs }}>
              Her çalışma alanının verisi tamamen ayrıdır. Aktif olanı seç; ana sayfa ona göre değişir.
            </Text>
            <View style={{ borderRadius: theme.radius.widget, backgroundColor: theme.colors.surfacePrimary, overflow: 'hidden' }}>
              <Stack gap="xxs">
                {workspaces.map((w) => {
                  const isOwner = w.owner_id === session?.user?.id;
                  const isActive = w.id === activeWorkspaceId;
                  const isPrimary = w.id === planState?.primaryWorkspaceId;
                  const readOnly = isWorkspaceReadOnly(planState, w.id);

                  if (editingWorkspaceId === w.id) {
                    return (
                      <Stack key={w.id} gap="sm" style={{ padding: theme.spacing.md }}>
                        <TextField placeholder="Çalışma alanı adı" value={nameDraft} onChangeText={setNameDraft} autoFocus />
                        <Row gap="sm">
                          <View style={{ flex: 1 }}>
                            <Button
                              label="Kaydet"
                              onPress={() => renameMutation.mutate({ id: w.id, name: nameDraft.trim() })}
                              loading={renameMutation.isPending}
                              disabled={!nameDraft.trim()}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Button label="Vazgeç" variant="secondary" onPress={() => setEditingWorkspaceId(null)} />
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
                      <Row gap="sm" align="center" style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm }}>
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isActive ? theme.colors.textPrimary : theme.colors.backgroundPrimary,
                          }}
                        >
                          <Text
                            variant="label"
                            mono
                            style={{
                              color: isActive ? theme.colors.backgroundPrimary : theme.colors.textPrimary,
                              textTransform: 'none',
                            }}
                          >
                            {workspaceInitials(w.name)}
                          </Text>
                        </View>
                        <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="cardTitle" numberOfLines={1}>
                            {w.name}
                          </Text>
                          <Text variant="caption" color={readOnly ? 'danger' : 'textSecondary'} numberOfLines={1}>
                            {w.type === 'business' ? 'İşletme' : 'Kişisel'}
                            {readOnly ? ' · Salt-okunur' : ''}
                            {planState?.overLimit && isPrimary ? ' · Birincil alan' : ''}
                          </Text>
                        </Stack>
                        {isOwner ? (
                          <View
                            style={{
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                              borderRadius: 6,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                            }}
                          >
                            <Text variant="caption" mono color="textSecondary">
                              Sahip
                            </Text>
                          </View>
                        ) : null}
                        <Pressable
                          accessibilityLabel="Ekip"
                          hitSlop={8}
                          onPress={() => router.push({ pathname: '/workspace/[id]/members', params: { id: w.id } })}
                        >
                          <Ionicons name="people-outline" size={18} color={theme.colors.textPrimary} />
                        </Pressable>
                        {isOwner ? (
                          <>
                            <Pressable accessibilityLabel="Adını düzenle" hitSlop={8} onPress={() => startEditing(w)}>
                              <Ionicons name="pencil" size={16} color={theme.colors.textSecondary} />
                            </Pressable>
                            <Pressable accessibilityLabel="Çalışma alanını sil" hitSlop={8} onPress={() => confirmDelete(w)}>
                              <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                            </Pressable>
                          </>
                        ) : null}
                        <View style={{ width: 18, alignItems: 'center' }}>
                          {isActive ? <Ionicons name="checkmark" size={18} color={theme.colors.textPrimary} /> : null}
                        </View>
                      </Row>
                    </Pressable>
                  );
                })}
              </Stack>
            </View>
          </Stack>
        )}

        <Stack gap="sm">
          {activeWorkspaceId ? (
            <Button
              label="Ekibi Yönet"
              variant="secondary"
              icon="people-outline"
              onPress={() =>
                router.push({ pathname: '/workspace/[id]/members', params: { id: activeWorkspaceId } })
              }
            />
          ) : null}
          <Button
            label="Davet Koduyla Katıl"
            variant="secondary"
            icon="enter-outline"
            onPress={() => router.push('/workspace/join')}
          />
          {/* Limit dolduğunda buton gizlenmez — kullanıcı neden oluşturamadığını görmeli ve
              doğrudan planlara gidebilmeli. Sunucu tarafında da ayrıca engellenir
              (enforce_workspace_plan_limit trigger'ı). */}
          <Button
            label={atWorkspaceLimit ? 'Yeni Alan İçin Planı Yükselt' : 'Yeni Çalışma Alanı Oluştur'}
            variant="secondary"
            icon={atWorkspaceLimit ? 'lock-closed-outline' : 'add-circle-outline'}
            onPress={() =>
              atWorkspaceLimit
                ? router.push('/paywall')
                : router.push({ pathname: '/workspace-setup', params: { step: 'create' } })
            }
          />
          {atWorkspaceLimit ? (
            <Text variant="caption" color="textSecondary">
              {planState?.plan === 'free'
                ? `Ücretsiz planda ${planState.workspaceLimit} çalışma alanı oluşturabilirsiniz.`
                : `Planınızda ${planState?.workspaceLimit} çalışma alanı hakkınız var ve tamamı kullanılıyor.`}
            </Text>
          ) : null}
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}
