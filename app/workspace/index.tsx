import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { withAlpha } from '@/theme/colors';
import { Button, Card, Pressable, Row, Stack, Text, TextField } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useSession } from '@/features/auth/useSession';
import { deleteWorkspace, listMyWorkspaces, updateWorkspaceName, type Workspace } from '@/features/workspaces/api';
import { queryKeys } from '@/services/queryKeys';
import { useWorkspaceStore } from '@/store/workspaceStore';

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
        {isEmpty ? (
          <Text variant="body" color="textSecondary">
            Henüz bir çalışma alanın yok. Yeni bir tane oluştur veya davet koduyla mevcut birine katıl.
          </Text>
        ) : (
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              ÇALIŞMA ALANLARIN — DOKUNARAK GEÇİŞ YAP
            </Text>
            <Card style={{ padding: 0 }}>
              <Stack gap="xxs">
                {workspaces.map((w) => {
                  const isOwner = w.owner_id === session?.user?.id;
                  const isActive = w.id === activeWorkspaceId;

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
                    <Pressable key={w.id} onPress={() => setActiveWorkspaceId(w.id)}>
                      <Row gap="sm" align="center" style={{ padding: theme.spacing.md }}>
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: theme.radius.pill,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: isActive ? 0 : 1.5,
                            borderColor: theme.colors.border,
                            backgroundColor: isActive ? theme.colors.brandPrimary : 'transparent',
                          }}
                        >
                          {isActive ? (
                            <Ionicons name="checkmark" size={14} color={theme.colors.brandPrimaryText} />
                          ) : null}
                        </View>
                        <Stack gap="xxs" style={{ flex: 1 }}>
                          <Text variant="body" numberOfLines={1}>
                            {w.name}
                          </Text>
                          <Text variant="caption" color="textSecondary">
                            {w.type === 'business' ? 'İşletme' : 'Kişisel'}
                          </Text>
                        </Stack>
                        <Pressable
                          accessibilityLabel="Ekip"
                          hitSlop={8}
                          onPress={() => router.push({ pathname: '/workspace/[id]/members', params: { id: w.id } })}
                        >
                          <Ionicons name="people-outline" size={18} color={theme.colors.brandPrimary} />
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
                      </Row>
                    </Pressable>
                  );
                })}
              </Stack>
            </Card>
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
          <Button
            label="Yeni Çalışma Alanı Oluştur"
            variant="secondary"
            icon="add-circle-outline"
            onPress={() => router.push({ pathname: '/workspace-setup', params: { step: 'create' } })}
          />
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}
