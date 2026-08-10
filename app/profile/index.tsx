import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { RETAIN_ORIGINAL_DEFAULT_KEY } from '@/utils/storageKeys';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Button, Card, Pressable, Row, Stack, Text, TextField } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { deleteAccount, signOut, updatePassword } from '@/features/auth/api';
import { translateAuthError } from '@/features/auth/errors';
import { useSession } from '@/features/auth/useSession';
import { listMyWorkspaces, updateWorkspaceName, deleteWorkspace, type Workspace } from '@/features/workspaces/api';
import { getMyProfile, updateMyProfile, uploadAvatar } from '@/features/profile/api';
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
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  // docs/07-guvenlik-gizlilik.md §11.3 — taranan belgelerin OCR analizi bittiğinde ham dosyası
  // Storage'da saklansın mı sorusu; yalnızca cihazda tutulur (workspace/hesap değil, kullanıcı
  // tercihi). Anahtar hiç yazılmadıysa varsayılan "saklama" (false) — hassas finansal belgeler
  // kullanıcı açıkça istemedikçe bucket'ta kalmaz (bkz. app/(tabs)/tara.tsx).
  const [retainOriginalDefault, setRetainOriginalDefault] = useState(false);

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

  useEffect(() => {
    AsyncStorage.getItem(RETAIN_ORIGINAL_DEFAULT_KEY).then((value) => {
      if (value !== null) setRetainOriginalDefault(value !== 'false');
    });
  }, []);

  function handleToggleRetainOriginal(value: boolean) {
    setRetainOriginalDefault(value);
    AsyncStorage.setItem(RETAIN_ORIGINAL_DEFAULT_KEY, value ? 'true' : 'false').catch(() => {});
  }

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

  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmitPassword = newPassword.length >= 6 && !passwordMismatch;

  function resetPasswordForm() {
    setIsChangingPassword(false);
    setNewPassword('');
    setConfirmPassword('');
  }

  const changePasswordMutation = useMutation({
    mutationFn: () => updatePassword(newPassword),
    onSuccess: () => showSuccessAlert('Şifreniz güncellendi.', resetPasswordForm),
  });

  const avatarMutation = useMutation({
    mutationFn: (asset: ImagePicker.ImagePickerAsset) => {
      if (!session?.user?.id) throw new Error('Oturum bulunamadı');
      return uploadAvatar(session.user.id, asset.uri, asset.mimeType ?? 'image/jpeg');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.profile() }),
    onError: (error) => Alert.alert('Fotoğraf yüklenemedi', error instanceof Error ? error.message : 'Bir hata oluştu'),
  });

  async function handlePickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('İzin gerekli', 'Profil fotoğrafı seçmek için fotoğraflarınıza erişim izni verin.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    avatarMutation.mutate(result.assets[0]);
  }

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
          <Pressable onPress={handlePickAvatar} disabled={avatarMutation.isPending}>
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: theme.radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
                overflow: 'hidden',
              }}
            >
              {profileQuery.data?.avatar_url ? (
                <Image source={{ uri: profileQuery.data.avatar_url }} style={{ width: 88, height: 88 }} />
              ) : (
                <Text variant="pageTitle" style={{ color: theme.colors.brandPrimary }}>
                  {initialsFrom(displayName, email)}
                </Text>
              )}
              {avatarMutation.isPending ? (
                <View
                  style={{
                    position: 'absolute',
                    width: 88,
                    height: 88,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: withAlpha('#000000', 0.4),
                  }}
                >
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : null}
            </View>
            <View
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.brandPrimary,
                borderWidth: 2,
                borderColor: theme.colors.backgroundPrimary,
              }}
            >
              <Ionicons name="camera" size={14} color={theme.colors.brandPrimaryText} />
            </View>
          </Pressable>
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
              ŞİFRE
            </Text>
            {isChangingPassword ? (
              <Stack gap="sm">
                <TextField
                  placeholder="Yeni şifre"
                  secureTextEntry={!passwordVisible}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  rightIcon={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                  onRightIconPress={() => setPasswordVisible((v) => !v)}
                  autoFocus
                />
                <TextField
                  placeholder="Yeni şifre (tekrar)"
                  secureTextEntry={!passwordVisible}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  error={passwordMismatch ? 'Şifreler eşleşmiyor.' : undefined}
                />
                {changePasswordMutation.error ? (
                  <Text variant="caption" color="danger">
                    {translateAuthError(changePasswordMutation.error, 'Şifre güncellenemedi')}
                  </Text>
                ) : null}
                <Row gap="sm">
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Kaydet"
                      onPress={() => changePasswordMutation.mutate()}
                      loading={changePasswordMutation.isPending}
                      disabled={!canSubmitPassword}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Vazgeç" variant="secondary" onPress={resetPasswordForm} />
                  </View>
                </Row>
              </Stack>
            ) : (
              <Pressable onPress={() => setIsChangingPassword(true)}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="body">••••••••</Text>
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

        <Card>
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              GİZLİLİK
            </Text>
            <Row align="center" style={{ justifyContent: 'space-between' }}>
              <Stack gap="xxs" style={{ flex: 1, marginRight: theme.spacing.sm }}>
                <Text variant="body">Taranan belgeleri sakla</Text>
                <Text variant="caption" color="textSecondary">
                  Kapalıyken (varsayılan), taranan belgenin ham görüntüsü OCR analizi biter
                  bitmez depolamadan silinir; oluşan kayıt etkilenmez. Açarsan belge, onay
                  ekranında karşılaştırma için depoda kalmaya devam eder.
                </Text>
              </Stack>
              <Switch
                value={retainOriginalDefault}
                onValueChange={handleToggleRetainOriginal}
                trackColor={{ false: theme.colors.border, true: theme.colors.brandPrimary }}
              />
            </Row>
            <Pressable onPress={() => router.push('/legal/privacy-policy')}>
              <Row align="center" style={{ justifyContent: 'space-between', paddingTop: theme.spacing.xs }}>
                <Text variant="body">Gizlilik Politikası ve KVKK Aydınlatma Metni</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
              </Row>
            </Pressable>
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
