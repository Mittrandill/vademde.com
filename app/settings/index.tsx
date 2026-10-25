import { useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { GroupedRow, GroupedRowAvatar, GroupedRowIcon, GroupedSection, GroupedToggleRow } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useSession } from '@/features/auth/useSession';
import { getMySubscription, getPlanLimits } from '@/features/subscriptions/api';
import { exportWorkspaceJson } from '@/features/export/api';
import { setAnalyticsConsent } from '@/services/analytics';
import { useAnalyticsConsentStore } from '@/store/analyticsConsentStore';
import { showErrorAlert } from '@/utils/alerts';
import { getMyProfile } from '@/features/profile/api';
import { listMyWorkspaces } from '@/features/workspaces/api';
import { queryKeys } from '@/services/queryKeys';
import { useAppLockStore } from '@/store/appLockStore';
import { authenticate, getBiometricSupport } from '@/services/appLock';
import { useThemePreferenceStore } from '@/store/themePreferenceStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { biometricLabel as resolveBiometricLabel } from '@/services/appLock';
import { PLAN_LABELS } from '@/features/subscriptions/planLabels';
import { t } from '@/i18n';

const THEME_LABEL_KEYS = {
  system: 'settings.appearance.themeSystem',
  light: 'settings.appearance.themeLight',
  dark: 'settings.appearance.themeDark',
} as const;


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
  const analyticsEnabled = useAnalyticsConsentStore((s) => s.enabled);
  const biometricSupportQuery = useQuery({ queryKey: ['biometric-support'], queryFn: getBiometricSupport });
  const biometricSupport = biometricSupportQuery.data;
  const biometricLabel = resolveBiometricLabel(biometricSupport?.kind);
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
      await exportWorkspaceJson(activeWorkspaceId, activeWorkspaceName ?? t('settings.defaultWorkspaceName'));
    } catch (error) {
      showErrorAlert(error, t('settings.exportFailed'));
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
      next ? t('settings.lockEnablePrompt', { label: biometricLabel }) : t('settings.lockDisablePrompt', { label: biometricLabel })
    );
    if (!confirmed) {
      Alert.alert(t('settings.lockFailedTitle'), t('settings.lockFailedBody'));
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
        <ScreenHeader title={t('settings.title')} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <GroupedSection title={t('settings.account')}>
          <GroupedRow
            leading={
              <GroupedRowAvatar initials={initialsFrom(fullName, email)} />
            }
            title={fullName || t('settings.completeProfile')}
            subtitle={email ?? undefined}
            onPress={() => router.push('/profile')}
          />
          <GroupedRow
            leading={<GroupedRowIcon name="sparkles-outline" />}
            title={t('settings.subscription')}
            subtitle={planLabel}
            onPress={() => router.push('/subscription')}
          />
        </GroupedSection>

        <GroupedSection title={t('settings.app')}>
          <GroupedRow
            leading={<GroupedRowIcon name="color-palette-outline" />}
            title={t('settings.appearanceRow')}
            subtitle={`${t(THEME_LABEL_KEYS[themePreference])} · ${t('settings.appearance.currentLanguage')}`}
            onPress={() => router.push('/settings/appearance')}
          />
          {Platform.OS === 'ios' ? (
            <GroupedRow
              leading={<GroupedRowIcon name="grid-outline" />}
              title={t('settings.widgets')}
              onPress={() => router.push('/settings/widgets')}
            />
          ) : null}
          <GroupedRow
            leading={<GroupedRowIcon name="pricetags-outline" />}
            title={t('settings.categories')}
            onPress={() => router.push('/categories')}
          />
          <GroupedRow
            leading={<GroupedRowIcon name="notifications-outline" />}
            title={t('settings.notifications')}
            onPress={() => router.push('/notifications')}
          />
          <GroupedRow
            leading={<GroupedRowIcon name="people-outline" />}
            title={t('settings.workspaces')}
            subtitle={activeWorkspaceName ?? (workspaceCount === 0 ? t('settings.createOrJoin') : undefined)}
            onPress={() => router.push('/workspace')}
          />
        </GroupedSection>

        <GroupedSection title={t('settings.privacy')}>
          {/* docs/10-abonelik-gelir-modeli.md — Face ID kilidi Plus ve İşletme planlarının
              özelliği. Cihaz desteklemiyorsa (donanım yok veya kullanıcı hiç yüz/parmak izi
              kaydetmemiş) satır hiç gösterilmez: açılamayacak bir ayarı göstermek kafa
              karıştırır. */}
          {biometricSupport?.available ? (
            <>
              <GroupedToggleRow
                leading={<GroupedRowIcon name="finger-print-outline" />}
                title={t('settings.lockTitle', { label: biometricLabel })}
                subtitle={planAllowsLock ? t('settings.lockOn') : t('settings.lockPlus')}
                value={appLockEnabled && planAllowsLock}
                disabled={!planAllowsLock}
                onValueChange={handleToggleAppLock}
              />
            </>
          ) : null}
          {/* KVKK m.5/1 açık rıza: varsayılan KAPALI. Açıkken yalnızca hangi ekranların ve abonelik
              adımlarının kullanıldığı paylaşılır; tutar, belge ve kişi bilgisi asla paylaşılmaz. */}
          <GroupedToggleRow
            leading={<GroupedRowIcon name="analytics-outline" />}
            title={t('settings.analytics')}
            subtitle={t('settings.analyticsHint')}
            value={analyticsEnabled}
            onValueChange={setAnalyticsConsent}
          />
          <GroupedRow
            leading={<GroupedRowIcon name="download-outline" />}
            title={t('settings.exportData')}
            subtitle={isExportingData ? t('settings.exportPreparing') : t('settings.exportJson')}
            onPress={handleExportData}
          />
          <GroupedRow
            leading={<GroupedRowIcon name="shield-checkmark-outline" />}
            title={t('settings.privacyPolicy')}
            onPress={() => router.push('/legal/privacy-policy')}
          />
        </GroupedSection>
      </ScrollView>
    </SafeAreaView>
  );
}
