import { useState, type ReactNode } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { withAlpha } from '@/theme/colors';
import { Card, Divider, Pressable, Row, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useSession } from '@/features/auth/useSession';
import { getMySubscription, getPlanLimits } from '@/features/subscriptions/api';
import { exportWorkspaceJson } from '@/features/export/api';
import { showErrorAlert } from '@/utils/alerts';
import { getMyProfile } from '@/features/profile/api';
import { listMyWorkspaces } from '@/features/workspaces/api';
import { queryKeys } from '@/services/queryKeys';
import { useAppLockStore } from '@/store/appLockStore';
import { authenticate, getBiometricSupport } from '@/services/appLock';
import { useThemePreferenceStore } from '@/store/themePreferenceStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

// docs/10-abonelik-gelir-modeli.md — plan kodu -> görünen ad.
const PLAN_LABELS: Record<string, string> = {
  free: 'Ücretsiz',
  plus: 'Vademde Plus',
  isletme: 'Vademde İşletme',
};

const THEME_LABELS = {
  system: 'Sistem',
  light: 'Açık',
  dark: 'Koyu',
} as const;

const ROW_ICON_SIZE = 32;
// İkon kutusundan sonraki hairline divider, ikon+gap+sol padding'in tam hizasından başlar.
const ROW_DIVIDER_INSET = ROW_ICON_SIZE + 12 + 16;

function initialsFrom(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email?.trim() || '';
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toLocaleUpperCase('tr-TR');
  }
  return source.slice(0, 2).toLocaleUpperCase('tr-TR');
}

// Ayarlar artık uygulama tercihlerinin (görünüm, çalışma alanı, kategoriler) yaşadığı ve
// kimlik/abonelik gibi daha derin ekranlara (Profil, Abonelik, Görünüm, Ekip) tek satırla
// açılan kompakt, gruplu bir liste — her bölümün mantığı kendi sayfasında yaşar (bkz.
// app/profile, app/subscription, app/settings/appearance, app/workspace/[id]/members,
// app/workspace-setup).
export default function SettingsScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const { session } = useSession();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const themePreference = useThemePreferenceStore((s) => s.themePreference);

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.subscription(),
    queryFn: getMySubscription,
  });

  const profileQuery = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: getMyProfile,
  });

  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces(),
    queryFn: listMyWorkspaces,
  });

  const planCode = subscriptionQuery.data?.plan ?? 'free';
  const planLabel = PLAN_LABELS[planCode] ?? planCode;

  // Uygulama kilidi (docs/10 — face_id). Üç koşul da gerekir: cihaz destekliyor, plan izin
  // veriyor, kullanıcı açmış.
  const appLockEnabled = useAppLockStore((s) => s.enabled);
  const setAppLockEnabled = useAppLockStore((s) => s.setEnabled);
  const biometricSupportQuery = useQuery({ queryKey: ['biometric-support'], queryFn: getBiometricSupport });
  const biometricSupport = biometricSupportQuery.data;
  const biometricLabel = biometricSupport?.label ?? 'Biyometrik';
  const planLimitsQuery = useQuery({
    queryKey: [...queryKeys.planLimits(), planCode],
    queryFn: () => getPlanLimits(planCode as 'free' | 'plus' | 'isletme'),
    enabled: subscriptionQuery.isSuccess,
  });
  const planAllowsLock = planLimitsQuery.data?.face_id ?? false;

  // Kilidi AÇARKEN bir kez doğrulama istenir: doğrulayamayan kullanıcı kilidi açarsa bir
  // daha uygulamaya giremezdi. Kapatırken de istenir ki telefonu eline geçiren biri kilidi
  // basitçe kapatamasın.
  // docs/07-guvenlik-gizlilik.md — kullanıcı kendi verisinin tamamını her zaman dışa
  // aktarabilmelidir (KVKK/GDPR veri taşınabilirliği); bu yüzden plana bağlı değildir.
  const [isExportingData, setIsExportingData] = useState(false);
  async function handleExportData() {
    if (!activeWorkspaceId || isExportingData) return;
    setIsExportingData(true);
    try {
      await exportWorkspaceJson(activeWorkspaceId, activeWorkspaceName ?? 'Çalışma Alanı');
    } catch (error) {
      showErrorAlert(error, 'Veriler dışa aktarılamadı.');
    } finally {
      setIsExportingData(false);
    }
  }

  async function handleToggleAppLock(next: boolean) {
    if (!planAllowsLock) {
      router.push('/paywall');
      return;
    }
    const confirmed = await authenticate(
      next ? `${biometricLabel} kilidini aç` : `${biometricLabel} kilidini kapat`
    );
    if (!confirmed) {
      Alert.alert('Doğrulanamadı', 'Kimlik doğrulaması tamamlanmadığı için ayar değiştirilmedi.');
      return;
    }
    setAppLockEnabled(next);
  }
  const email = session?.user?.email ?? null;
  const fullName = profileQuery.data?.full_name ?? null;
  const activeWorkspaceName = workspacesQuery.data?.find((w) => w.id === activeWorkspaceId)?.name;
  const workspaceCount = workspacesQuery.data?.length ?? 0;

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader title="Ayarlar" />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <SettingsSection title="HESAP">
          <SettingsRow
            leading={
              <RowAvatar initials={initialsFrom(fullName, email)} />
            }
            title={fullName || 'Profilini tamamla'}
            subtitle={email ?? undefined}
            onPress={() => router.push('/profile')}
          />
          <Divider style={{ marginLeft: ROW_DIVIDER_INSET }} />
          <SettingsRow
            leading={<RowIcon name="sparkles-outline" />}
            title="Abonelik"
            subtitle={planLabel}
            onPress={() => router.push('/subscription')}
          />
        </SettingsSection>

        <SettingsSection title="UYGULAMA">
          <SettingsRow
            leading={<RowIcon name="color-palette-outline" />}
            title="Görünüm"
            subtitle={THEME_LABELS[themePreference]}
            onPress={() => router.push('/settings/appearance')}
          />
          <Divider style={{ marginLeft: ROW_DIVIDER_INSET }} />
          <SettingsRow
            leading={<RowIcon name="pricetags-outline" />}
            title="Kategoriler"
            onPress={() => router.push('/categories')}
          />
          <Divider style={{ marginLeft: ROW_DIVIDER_INSET }} />
          <SettingsRow
            leading={<RowIcon name="notifications-outline" />}
            title="Bildirimler"
            onPress={() => router.push('/notifications')}
          />
          <Divider style={{ marginLeft: ROW_DIVIDER_INSET }} />
          <SettingsRow
            leading={<RowIcon name="people-outline" />}
            title="Çalışma Alanları"
            subtitle={activeWorkspaceName ?? (workspaceCount === 0 ? 'Oluştur veya katıl' : undefined)}
            onPress={() => router.push('/workspace')}
          />
        </SettingsSection>

        <SettingsSection title="GİZLİLİK">
          {/* docs/10-abonelik-gelir-modeli.md — Face ID kilidi Plus ve İşletme planlarının
              özelliği. Cihaz desteklemiyorsa (donanım yok veya kullanıcı hiç yüz/parmak izi
              kaydetmemiş) satır hiç gösterilmez: açılamayacak bir ayarı göstermek kafa
              karıştırır. */}
          {biometricSupport?.available ? (
            <>
              <SettingsToggleRow
                leading={<RowIcon name="finger-print-outline" />}
                title={`${biometricLabel} Kilidi`}
                subtitle={
                  planAllowsLock
                    ? 'Uygulama açılışında kimlik doğrulama'
                    : 'Plus planında kullanılabilir'
                }
                value={appLockEnabled && planAllowsLock}
                disabled={!planAllowsLock}
                onValueChange={handleToggleAppLock}
              />
              <Divider style={{ marginLeft: ROW_DIVIDER_INSET }} />
            </>
          ) : null}
          <SettingsRow
            leading={<RowIcon name="download-outline" />}
            title="Verilerimi Dışa Aktar"
            subtitle={isExportingData ? 'Hazırlanıyor…' : 'JSON yedeği'}
            onPress={handleExportData}
          />
          <Divider style={{ marginLeft: ROW_DIVIDER_INSET }} />
          <SettingsRow
            leading={<RowIcon name="shield-checkmark-outline" />}
            title="Gizlilik Politikası ve KVKK"
            onPress={() => router.push('/legal/privacy-policy')}
          />
        </SettingsSection>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Stack gap="xs">
      <Text variant="caption" color="textSecondary" style={{ paddingLeft: theme.spacing.xs }}>
        {title}
      </Text>
      <Card style={{ padding: 0 }}>{children}</Card>
    </Stack>
  );
}

function SettingsRow({
  leading,
  title,
  subtitle,
  onPress,
}: {
  leading: ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress}>
      <Row
        gap="sm"
        align="center"
        style={{ paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md }}
      >
        {leading}
        <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
      </Row>
    </Pressable>
  );
}

// Ayarlar listesinde ekrana götürmeyen, yerinde açılıp kapanan satır (uygulama kilidi).
// SettingsRow ile aynı yükseklik/hizalama dilini paylaşır ki liste tek bir ritimde kalsın.
function SettingsToggleRow({
  leading,
  title,
  subtitle,
  value,
  disabled,
  onValueChange,
}: {
  leading: ReactNode;
  title: string;
  subtitle?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <Row
      gap="sm"
      align="center"
      style={{ paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md }}
    >
      {leading}
      <Stack gap="xxs" style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </Stack>
      <Switch value={value} disabled={disabled} onValueChange={onValueChange} />
    </Row>
  );
}

function RowIcon({ name }: { name: keyof typeof Ionicons.glyphMap }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: ROW_ICON_SIZE,
        height: ROW_ICON_SIZE,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withAlpha(theme.colors.brandPrimary, 0.14),
      }}
    >
      <Ionicons name={name} size={16} color={theme.colors.brandPrimary} />
    </View>
  );
}

function RowAvatar({ initials }: { initials: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: ROW_ICON_SIZE,
        height: ROW_ICON_SIZE,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
      }}
    >
      <Text variant="caption" style={{ color: theme.colors.brandPrimary, fontWeight: '600' }}>
        {initials}
      </Text>
    </View>
  );
}
