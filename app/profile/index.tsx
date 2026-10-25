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
import { t } from '@/i18n';

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
    ({ free: t('profile.planFree'), plus: t('profile.planPlus'), isletme: t('profile.planIsletme') } as Record<string, string>)[
      planCode
    ] ?? planCode;

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
      if (!session?.user?.id) throw new Error(t('profile.noSession'));
      return updateMyProfile(session.user.id, fullName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
      showSuccessAlert(t('profile.nameUpdated'), () => {});
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
    onSuccess: () => showSuccessAlert(t('profile.passwordUpdated'), resetPasswordForm),
  });

  const avatarMutation = useMutation({
    mutationFn: (asset: ImagePicker.ImagePickerAsset) => {
      if (!session?.user?.id) throw new Error(t('profile.noSession'));
      return uploadAvatar(session.user.id, asset.uri, asset.mimeType ?? 'image/jpeg');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.profile() }),
    onError: (error) => Alert.alert(t('profile.photoUploadFailed'), friendlyErrorMessage(error, t('profile.genericError'))),
  });

  async function handlePickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('profile.permissionTitle'), t('profile.permissionBody'));
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
      t('profile.deleteTitle'),
      t('profile.deleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.deleteConfirm'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('profile.deleteSureTitle'),
              t('profile.deleteSureBody'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('profile.deletePermanent'), style: 'destructive', onPress: handleDeleteAccount },
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
      Alert.alert(t('profile.deleteFailed'), friendlyErrorMessage(err, t('profile.genericError')));
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
          title={t('profile.title')}
          left={{ icon: 'close', accessibilityLabel: t('profile.back'), onPress: () => router.back() }}
          rightLabel={{
            label: t('common.save'),
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
          <Pressable onPress={handlePickAvatar} disabled={avatarMutation.isPending} accessibilityLabel={t('profile.changePhoto')}>
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
              {profileQuery.data?.avatar_url ? t('profile.changePhotoLink') : t('profile.addPhoto')}
            </Text>
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Tag label={planLabel} tone={planCode === 'free' ? 'neutral' : 'brand'} />
          </View>
        </Stack>

        <Stack gap="xs">
          <FieldGroup>
            <TextField label={t('profile.fullName')} placeholder={t('profile.fullNamePlaceholder')} value={fullName} onChangeText={setFullName} />
            <TextField label={t('profile.email')} value={email ?? ''} editable={false} />
          </FieldGroup>
          {updateNameMutation.error ? (
            <Text variant="caption" color="danger">
              {friendlyErrorMessage(updateNameMutation.error, t('profile.saveFailed'))}
            </Text>
          ) : null}
        </Stack>

        <GroupedSection title={t('profile.security')}>
          <GroupedRow
            leading={<GroupedRowIcon name="key-outline" />}
            title={t('profile.changePassword')}
            onPress={() => setIsChangingPassword((v) => !v)}
          />
        </GroupedSection>
        {isChangingPassword ? (
          <Stack gap="sm">
            <TextField
              label={t('profile.newPassword')}
              secureTextEntry={!passwordVisible}
              value={newPassword}
              onChangeText={setNewPassword}
              rightIcon={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              onRightIconPress={() => setPasswordVisible((v) => !v)}
              autoFocus
            />
            <TextField
              label={t('profile.confirmPassword')}
              secureTextEntry={!passwordVisible}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              error={passwordMismatch ? t('profile.mismatch') : undefined}
            />
            {changePasswordMutation.error ? (
              <Text variant="caption" color="danger">
                {translateAuthError(changePasswordMutation.error, t('profile.passwordFailed'))}
              </Text>
            ) : null}
            <Row gap="sm">
              <View style={{ flex: 1 }}>
                <Button
                  label={t('common.save')}
                  onPress={() => changePasswordMutation.mutate()}
                  loading={changePasswordMutation.isPending}
                  disabled={!canSubmitPassword}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button label={t('common.cancel')} variant="secondary" onPress={resetPasswordForm} />
              </View>
            </Row>
          </Stack>
        ) : null}

        <GroupedSection title={t('profile.workspaces')}>
          {(workspacesQuery.data ?? []).map((w) => (
            <GroupedRow
              key={w.id}
              leading={<GroupedRowIcon name={w.type === 'business' ? 'briefcase-outline' : 'person-outline'} />}
              title={w.name}
              value={w.type === 'business' ? t('profile.business') : t('profile.personal')}
              onPress={() => router.push({ pathname: '/workspace/[id]/members', params: { id: w.id } })}
            />
          ))}
          <GroupedRow
            leading={<GroupedRowIcon name="enter-outline" />}
            title={t('profile.joinWithCode')}
            onPress={() => router.push('/workspace/join')}
          />
        </GroupedSection>

        <GroupedSection title={t('profile.privacy')}>
          <GroupedToggleRow
            title={t('profile.retainDocs')}
            subtitle={t('profile.retainDocsHint')}
            value={retainOriginalDefault}
            onValueChange={handleToggleRetainOriginal}
          />
          <GroupedRow
            leading={<GroupedRowIcon name="shield-checkmark-outline" />}
            title={t('profile.privacyPolicy')}
            onPress={() => router.push('/legal/privacy-policy')}
          />
        </GroupedSection>

        <GroupedSection>
          <GroupedRow
            leading={<GroupedRowIcon name="sparkles-outline" />}
            title={t('profile.subscription')}
            onPress={() => router.push('/subscription')}
          />
          <GroupedRow
            leading={<GroupedRowIcon name="settings-outline" />}
            title={t('profile.settings')}
            onPress={() => router.push('/settings')}
          />
        </GroupedSection>

        <Stack gap="xs">
          <Button label={t('profile.signOut')} variant="secondary" icon="log-out-outline" onPress={handleSignOut} />
          <Pressable
            onPress={confirmDeleteAccount}
            disabled={isDeleting}
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text variant="cardTitle" color="danger">
              {isDeleting ? t('profile.deleting') : t('profile.deleteAccount')}
            </Text>
          </Pressable>
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}
