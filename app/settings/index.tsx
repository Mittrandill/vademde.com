import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, Card, Pressable, Row, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { deleteAccount, signOut } from '@/features/auth/api';
import { useSession } from '@/features/auth/useSession';
import { listMyWorkspaces } from '@/features/workspaces/api';
import { currentPeriodMonth, getCurrentOcrUsage, getMySubscription } from '@/features/subscriptions/api';
import { getMyProfile, updateMyProfile } from '@/features/profile/api';
import { queryKeys } from '@/services/queryKeys';
import { useThemePreferenceStore } from '@/store/themePreferenceStore';

const THEME_OPTIONS = [
  { key: 'system' as const, label: 'Sistem' },
  { key: 'light' as const, label: 'Açık' },
  { key: 'dark' as const, label: 'Koyu' },
];

const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  grace_period: 'Ödeme sorunu — ödeme yönteminizi güncelleyin',
  expired: 'Süresi doldu',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR');
}

// docs/10-abonelik-gelir-modeli.md — plan kodu -> görünen ad.
const PLAN_LABELS: Record<string, string> = {
  free: 'Ücretsiz',
  plus: 'Vademde Plus',
  isletme: 'Vademde İşletme',
};

// docs/07-guvenlik-gizlilik.md — "Hesabı uygulama içinden silme" P0 gereksinimi.
export default function SettingsScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const themePreference = useThemePreferenceStore((s) => s.themePreference);
  const setThemePreference = useThemePreferenceStore((s) => s.setThemePreference);
  const [isDeleting, setIsDeleting] = useState(false);
  const [fullName, setFullName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);

  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces(),
    queryFn: listMyWorkspaces,
  });

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.subscription(),
    queryFn: getMySubscription,
  });

  const ocrUsageQuery = useQuery({
    queryKey: queryKeys.ocrUsage(currentPeriodMonth()),
    queryFn: getCurrentOcrUsage,
  });

  const profileQuery = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: getMyProfile,
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
      setIsEditingName(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.profile() });
    },
  });

  const planCode = subscriptionQuery.data?.plan ?? 'free';
  const planLabel = PLAN_LABELS[planCode] ?? planCode;
  const subscription = subscriptionQuery.data;
  const renewalLine =
    subscription && planCode !== 'free'
      ? SUBSCRIPTION_STATUS_LABEL[subscription.status] ??
        (subscription.current_period_end
          ? `${subscription.will_renew ? 'Sonraki yenileme' : 'Yenilenmeyecek — sona erme'}: ${formatDate(subscription.current_period_end)}${
              subscription.billing_period ? ` (${subscription.billing_period === 'yearly' ? 'yıllık' : 'aylık'})` : ''
            }`
          : null)
      : null;

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
      <Row
        align="center"
        gap="sm"
        style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text variant="pageTitle">Ayarlar</Text>
      </Row>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <Card>
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              PROFİL
            </Text>
            {isEditingName ? (
              <Stack gap="sm">
                <TextField placeholder="Ad Soyad" value={fullName} onChangeText={setFullName} />
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
                  <Text variant="body">{profileQuery.data?.full_name || 'Ad Soyad ekle'}</Text>
                  <Ionicons name="pencil" size={16} color={theme.colors.textSecondary} />
                </Row>
              </Pressable>
            )}
            <Text variant="body" color="textSecondary">
              {session?.user?.email ?? '—'}
            </Text>
          </Stack>
        </Card>

        <Card>
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              GÖRÜNÜM
            </Text>
            <SegmentedControl options={THEME_OPTIONS} value={themePreference} onChange={setThemePreference} />
          </Stack>
        </Card>

        <Card>
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              ABONELİK
            </Text>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="body">{planLabel}</Text>
              <View
                style={{
                  alignSelf: 'flex-start',
                  paddingHorizontal: theme.spacing.xs,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor:
                    (planCode === 'free' ? theme.colors.textSecondary : theme.colors.brandPrimary) + '26',
                }}
              >
                <Text
                  variant="caption"
                  style={{
                    color: planCode === 'free' ? theme.colors.textSecondary : theme.colors.brandPrimary,
                    fontWeight: '600',
                  }}
                >
                  {planCode === 'free' ? 'Aktif' : 'Aktif Üyelik'}
                </Text>
              </View>
            </Row>
            {renewalLine ? (
              <Text variant="caption" color="textSecondary">
                {renewalLine}
              </Text>
            ) : null}
            {ocrUsageQuery.data ? (
              <Text variant="caption" color="textSecondary">
                Bu ay OCR kullanımı: {ocrUsageQuery.data.usedCount}/{ocrUsageQuery.data.quota}
              </Text>
            ) : null}
            <Pressable onPress={() => router.push('/paywall')}>
              <Row style={{ justifyContent: 'space-between', paddingVertical: theme.spacing.sm }}>
                <Text variant="body">Planı Yönet</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
              </Row>
            </Pressable>
          </Stack>
        </Card>

        <Card>
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              ÇALIŞMA ALANLARI
            </Text>
            {(workspacesQuery.data ?? []).map((w) => (
              <Row key={w.id} style={{ justifyContent: 'space-between' }}>
                <Text variant="body">{w.name}</Text>
                <Text variant="caption" color="textSecondary">
                  {w.type === 'business' ? 'İşletme' : 'Kişisel'}
                </Text>
              </Row>
            ))}
          </Stack>
        </Card>

        <Card>
          <Stack gap="xxs">
            <Pressable onPress={() => router.push('/categories')}>
              <Row style={{ justifyContent: 'space-between', paddingVertical: theme.spacing.sm }}>
                <Text variant="body">Kategoriler</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
              </Row>
            </Pressable>
            <Pressable onPress={() => router.push('/counterparties')}>
              <Row style={{ justifyContent: 'space-between', paddingVertical: theme.spacing.sm }}>
                <Text variant="body">Kişi / Firmalar</Text>
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
