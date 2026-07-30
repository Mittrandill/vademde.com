import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, Card, Pressable, Row, Stack, Text } from '@/components/primitives';
import { deleteAccount, signOut } from '@/features/auth/api';
import { useSession } from '@/features/auth/useSession';
import { listMyWorkspaces } from '@/features/workspaces/api';
import { currentPeriodMonth, getCurrentOcrUsage, getMySubscription } from '@/features/subscriptions/api';
import { queryKeys } from '@/services/queryKeys';

// docs/10-abonelik-gelir-modeli.md — plan kodu -> görünen ad.
const PLAN_LABELS: Record<string, string> = {
  free: 'Ücretsiz',
  plus: 'Vademde Plus',
  isletme: 'Vademde İşletme',
};

// docs/07-guvenlik-gizlilik.md — "Hesabı uygulama içinden silme" P0 gereksinimi.
export default function SettingsScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const [isDeleting, setIsDeleting] = useState(false);

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

  const planCode = subscriptionQuery.data?.plan ?? 'free';
  const planLabel = PLAN_LABELS[planCode] ?? planCode;

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
          <Stack gap="xxs">
            <Text variant="caption" color="textSecondary">
              HESAP
            </Text>
            <Text variant="body">{session?.user?.email ?? '—'}</Text>
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
