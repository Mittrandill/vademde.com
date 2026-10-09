import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { RETAIN_ORIGINAL_DEFAULT_KEY } from '@/utils/storageKeys';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { withAlpha } from '@/theme/colors';
import {
  Button,
  FieldGroup,
  GroupedRow,
  GroupedRowIcon,
  GroupedSection,
  GroupedToggleRow,
  Pressable,
  Row,
  Stack,
  Tag,
  Text,
  TextField,
} from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { deleteAccount, signOut, updatePassword } from '@/features/auth/api';
import { translateAuthError } from '@/features/auth/errors';
import { useSession } from '@/features/auth/useSession';
import { listMyWorkspaces } from '@/features/workspaces/api';
import { getMySubscription } from '@/features/subscriptions/api';
import { getMyProfile, updateMyProfile, uploadAvatar } from '@/features/profile/api';
import { queryKeys } from '@/services/queryKeys';
import { showSuccessAlert, friendlyErrorMessage } from '@/utils/alerts';

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
  const reflowKey = useReflowKey();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [isDeleting, setIsDeleting] = useState(false);
  const [fullName, setFullName] = useState('');
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

  const subscriptionQuery = useQuery({ queryKey: queryKeys.subscription(), queryFn: getMySubscription });
  const planCode = subscriptionQuery.data?.plan ?? 'free';
  const planLabel =
    ({ free: 'Ücretsiz plan', plus: 'Plus plan', isletme: 'İşletme planı' } as Record<string, string>)[planCode] ??
    planCode;

  useEffect(() => {
    if (profileQuery.data) {
      setFullName(profileQuery.data.full_name ?? '');
    }
  }, [profileQuery.data]);

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
      showSuccessAlert('Ad Soyad başarıyla güncellendi.', () => {});
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
    onError: (error) => Alert.alert('Fotoğraf yüklenemedi', friendlyErrorMessage(error, 'Bir hata oluştu')),
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
      Alert.alert('Hesap silinemedi', friendlyErrorMessage(err, 'Bir hata oluştu'));
      setIsDeleting(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/(auth)/sign-in');
  }

  const nameChanged = fullName.trim() !== (profileQuery.data?.full_name ?? '').trim();

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader
          inline
          title="Profil"
          left={{ icon: 'close', accessibilityLabel: 'Geri', onPress: () => router.back() }}
          rightLabel={{
            label: 'Kaydet',
            bold: true,
            disabled: !nameChanged || updateNameMutation.isPending,
            onPress: () => updateNameMutation.mutate(),
          }}
        />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <Stack align="center" gap="xs">
          <Pressable onPress={handlePickAvatar} disabled={avatarMutation.isPending} accessibilityLabel="Fotoğraf değiştir">
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: theme.radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.brandPrimary,
                overflow: 'hidden',
              }}
            >
              {profileQuery.data?.avatar_url ? (
                <Image source={{ uri: profileQuery.data.avatar_url }} style={{ width: 88, height: 88 }} />
              ) : (
                <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: '600', color: theme.colors.onAction }}>
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
                right: -4,
                bottom: -4,
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.surfacePrimary,
                borderWidth: 3,
                borderColor: theme.colors.backgroundPrimary,
              }}
            >
              <Ionicons name="pencil" size={15} color={theme.colors.textPrimary} />
            </View>
          </Pressable>
          <Pressable onPress={handlePickAvatar} disabled={avatarMutation.isPending} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '500', color: theme.colors.textSecondary }}>
              {profileQuery.data?.avatar_url ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'}
            </Text>
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Tag label={planLabel} tone={planCode === 'free' ? 'neutral' : 'brand'} />
          </View>
        </Stack>

        <Stack gap="xs">
          <FieldGroup>
            <TextField label="Ad soyad" placeholder="Adın ve soyadın" value={fullName} onChangeText={setFullName} />
            <TextField label="E-posta" value={email ?? ''} editable={false} />
          </FieldGroup>
          {updateNameMutation.error ? (
            <Text variant="caption" color="danger">
              {friendlyErrorMessage(updateNameMutation.error, 'Kaydedilemedi')}
            </Text>
          ) : null}
        </Stack>

        <GroupedSection title="GÜVENLİK">
          <GroupedRow
            leading={<GroupedRowIcon name="key-outline" />}
            title="Şifre değiştir"
            onPress={() => setIsChangingPassword((v) => !v)}
          />
        </GroupedSection>
        {isChangingPassword ? (
          <Stack gap="sm">
            <TextField
              label="Yeni şifre"
              secureTextEntry={!passwordVisible}
              value={newPassword}
              onChangeText={setNewPassword}
              rightIcon={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              onRightIconPress={() => setPasswordVisible((v) => !v)}
              autoFocus
            />
            <TextField
              label="Yeni şifre (tekrar)"
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
        ) : null}

        <GroupedSection title="ÇALIŞMA ALANLARI">
          {(workspacesQuery.data ?? []).map((w) => (
            <GroupedRow
              key={w.id}
              leading={<GroupedRowIcon name={w.type === 'business' ? 'briefcase-outline' : 'person-outline'} />}
              title={w.name}
              value={w.type === 'business' ? 'İşletme' : 'Kişisel'}
              onPress={() => router.push({ pathname: '/workspace/[id]/members', params: { id: w.id } })}
            />
          ))}
          <GroupedRow
            leading={<GroupedRowIcon name="enter-outline" />}
            title="Davet koduyla katıl"
            onPress={() => router.push('/workspace/join')}
          />
        </GroupedSection>

        <GroupedSection title="GİZLİLİK">
          <GroupedToggleRow
            title="Taranan belgeleri sakla"
            subtitle="Kapalıyken taranan belgenin ham görüntüsü OCR analizi biter bitmez depolamadan silinir; oluşan kayıt etkilenmez. Açarsan belge onay ekranında karşılaştırma için depoda kalır."
            value={retainOriginalDefault}
            onValueChange={handleToggleRetainOriginal}
          />
          <GroupedRow
            leading={<GroupedRowIcon name="shield-checkmark-outline" />}
            title="Gizlilik Politikası ve KVKK"
            onPress={() => router.push('/legal/privacy-policy')}
          />
        </GroupedSection>

        <GroupedSection>
          <GroupedRow
            leading={<GroupedRowIcon name="sparkles-outline" />}
            title="Abonelik"
            onPress={() => router.push('/subscription')}
          />
          <GroupedRow
            leading={<GroupedRowIcon name="settings-outline" />}
            title="Ayarlar"
            onPress={() => router.push('/settings')}
          />
        </GroupedSection>

        <Stack gap="xs">
          <Button label="Çıkış yap" variant="secondary" icon="log-out-outline" onPress={handleSignOut} />
          <Pressable
            onPress={confirmDeleteAccount}
            disabled={isDeleting}
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text variant="cardTitle" color="danger">
              {isDeleting ? 'Siliniyor…' : 'Hesabımı ve verilerimi sil'}
            </Text>
          </Pressable>
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}
