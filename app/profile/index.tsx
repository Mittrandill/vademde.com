import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Button, Card, Pressable, Row, Stack, Text, TextField } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { deleteAccount, signOut } from '@/features/auth/api';
import { useSession } from '@/features/auth/useSession';
import { listMyWorkspaces, updateWorkspaceName, deleteWorkspace, type Workspace } from '@/features/workspaces/api';
import { getMyProfile, updateMyProfile } from '@/features/profile/api';
import { queryKeys } from '@/services/queryKeys';
import { showSuccessAlert } from '@/utils/alerts';
import { useWorkspaceStore } from '@/store/workspaceStore';

function initialsFrom(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email?.trim() || '';
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toLocaleUpperCase('tr-TR');
  }
  return source.slice(0, 2).toLocaleUpperCase('tr-TR');
}

// docs/07-guvenlik-gizlilik.md — "Hesabı uygulama içinden silme" P0 gereksinimi.
// Kimlikle ilgili tüm eylemler (ad düzenleme, çalışma alanları, çıkış, hesap silme)
// Ayarlar'dan ayrılıp buraya toplanır — Ayarlar yalnızca uygulama tercihlerinin
// (görünüm) ve diğer hub ekranlarına gidişin yaşadığı yer olur.
export default function ProfileScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspaceStore();
  const [isDeleting, setIsDeleting] = useState(false);
  const [fullName, setFullName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState('');

  const profileQuery = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: getMyProfile,
  });

  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces(),
    queryFn: listMyWorkspaces,
  });

  useEffect(() => {
    if (profileQuery.data && !isEditingName) {
      setFullName(profileQuery.data.full_name ?? '');
    }
  }, [profileQuery.data, isEditingName]);

  const updateNameMutation = useMutation({
    mutationFn: () => {
      if (!session?.user?.id) throw new Error('Oturum bulunamadı');
      return updateMyProfile(session.user.id, fullName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
      showSuccessAlert('Ad Soyad başarıyla güncellendi.', () => setIsEditingName(false));
    },
  });

  const email = session?.user?.email ?? null;
  const displayName = profileQuery.data?.full_name ?? null;

  const renameWorkspaceMutation = useMutation({
    mutationFn: (vars: { id: string; name: string }) => updateWorkspaceName(vars.id, vars.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
      setEditingWorkspaceId(null);
    },
    onError: (error) => Alert.alert('Kaydedilemedi', error instanceof Error ? error.message : 'Bir hata oluştu'),
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: (id: string) => deleteWorkspace(id),
    onSuccess: (_data, id) => {
      if (activeWorkspaceId === id) setActiveWorkspaceId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
    },
    onError: (error) => Alert.alert('Silinemedi', error instanceof Error ? error.message : 'Bir hata oluştu'),
  });

  function startEditingWorkspace(workspace: Workspace) {
    setEditingWorkspaceId(workspace.id);
    setWorkspaceNameDraft(workspace.name);
  }

  // Hesap silmeyle aynı çift onaylı desen (bkz. confirmDeleteAccount) — workspace_id
  // tüm finansal tablolarda ON DELETE CASCADE olduğu için burada da geri alınamaz bir işlem.
  function confirmDeleteWorkspace(workspace: Workspace) {
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
              {
                text: 'Kalıcı Olarak Sil',
                style: 'destructive',
                onPress: () => deleteWorkspaceMutation.mutate(workspace.id),
              },
            ]);
          },
        },
      ]
    );
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Hesabını ve tüm verilerini sil',
      'Bu işlem geri alınamaz. Tüm çalışma alanların, hesapların, işlemlerin, borç/alacak kayıtların ve yüklediğin belgeler kalıcı olarak silinecek.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Hesabımı Sil',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Emin misin?',
              'Bu son bir uyarıdır. Hesabını sildiğinde bu veriler kurtarılamaz.',
              [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Kalıcı Olarak Sil', style: 'destructive', onPress: handleDeleteAccount },
              ]
            );
          },
        },
      ]
    );
  }

  async function handleDeleteAccount() {
    setIsDeleting(true);
    try {
      await deleteAccount();
      router.replace('/(auth)/sign-in');
    } catch (err) {
      Alert.alert('Hesap silinemedi', err instanceof Error ? err.message : 'Bir hata oluştu');
      setIsDeleting(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/(auth)/sign-in');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader title="Profil" left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: () => router.back() }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <Stack align="center" gap="sm" style={{ paddingVertical: theme.spacing.sm }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: theme.radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
            }}
          >
            <Text variant="pageTitle" style={{ color: theme.colors.brandPrimary }}>
              {initialsFrom(displayName, email)}
            </Text>
          </View>
          <Stack align="center" gap="xxs">
            <Text variant="sectionTitle" numberOfLines={1}>
              {displayName || 'Profilini tamamla'}
            </Text>
            <Text variant="body" color="textSecondary" numberOfLines={1}>
              {email ?? '—'}
            </Text>
          </Stack>
        </Stack>

        <Card>
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              AD SOYAD
            </Text>
            {isEditingName ? (
              <Stack gap="sm">
                <TextField placeholder="Ad Soyad" value={fullName} onChangeText={setFullName} autoFocus />
                {updateNameMutation.error ? (
                  <Text variant="caption" color="danger">
                    {updateNameMutation.error instanceof Error
                      ? updateNameMutation.error.message
                      : 'Kaydedilemedi'}
                  </Text>
                ) : null}
                <Row gap="sm">
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Kaydet"
                      onPress={() => updateNameMutation.mutate()}
                      loading={updateNameMutation.isPending}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Vazgeç"
                      variant="secondary"
                      onPress={() => {
                        setFullName(profileQuery.data?.full_name ?? '');
                        setIsEditingName(false);
                      }}
                    />
                  </View>
                </Row>
              </Stack>
            ) : (
              <Pressable onPress={() => setIsEditingName(true)}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="body">{displayName || 'Ad Soyad ekle'}</Text>
                  <Ionicons name="pencil" size={16} color={theme.colors.textSecondary} />
                </Row>
              </Pressable>
            )}
          </Stack>
        </Card>

        <Card>
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              ÇALIŞMA ALANLARI
            </Text>
            {(workspacesQuery.data ?? []).map((w) => {
              const isOwner = w.owner_id === session?.user?.id;

              if (editingWorkspaceId === w.id) {
                return (
                  <Stack key={w.id} gap="sm">
                    <TextField placeholder="Çalışma alanı adı" value={workspaceNameDraft} onChangeText={setWorkspaceNameDraft} autoFocus />
                    <Row gap="sm">
                      <View style={{ flex: 1 }}>
                        <Button
                          label="Kaydet"
                          onPress={() => renameWorkspaceMutation.mutate({ id: w.id, name: workspaceNameDraft.trim() })}
                          loading={renameWorkspaceMutation.isPending}
                          disabled={!workspaceNameDraft.trim()}
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
                <Row key={w.id} align="center" style={{ justifyContent: 'space-between' }}>
                  <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                    {w.name}
                  </Text>
                  <Row gap="sm" align="center">
                    <Text variant="caption" color="textSecondary">
                      {w.type === 'business' ? 'İşletme' : 'Kişisel'}
                    </Text>
                    <Pressable
                      accessibilityLabel="Ekip"
                      hitSlop={8}
                      onPress={() => router.push({ pathname: '/workspace/[id]/members', params: { id: w.id } })}
                    >
                      <Ionicons name="people-outline" size={18} color={theme.colors.brandPrimary} />
                    </Pressable>
                    {isOwner ? (
                      <>
                        <Pressable accessibilityLabel="Adını düzenle" hitSlop={8} onPress={() => startEditingWorkspace(w)}>
                          <Ionicons name="pencil" size={16} color={theme.colors.textSecondary} />
                        </Pressable>
                        <Pressable accessibilityLabel="Çalışma alanını sil" hitSlop={8} onPress={() => confirmDeleteWorkspace(w)}>
                          <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                        </Pressable>
                      </>
                    ) : null}
                  </Row>
                </Row>
              );
            })}
            <Button
              label="Davet koduyla katıl"
              variant="secondary"
              icon="enter-outline"
              onPress={() => router.push('/workspace/join')}
            />
          </Stack>
        </Card>

        <Button label="Çıkış Yap" variant="secondary" onPress={handleSignOut} />

        <Stack gap="sm" style={{ marginTop: theme.spacing.lg }}>
          <Text variant="caption" color="textSecondary">
            TEHLİKELİ BÖLGE
          </Text>
          <Button
            label="Hesabımı ve Verilerimi Sil"
            variant="danger"
            onPress={confirmDeleteAccount}
            loading={isDeleting}
          />
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}
