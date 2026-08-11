import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

import { ThemeProvider, useTheme } from '@/theme';
import { useSession } from '@/features/auth/useSession';
import { initDatabase } from '@/db';
import { asyncStoragePersister, attachFocusManager, queryClient } from '@/services/queryClient';
import { configurePurchases, logOutPurchases } from '@/services/purchases';
import { registerPushToken, unregisterCurrentPushToken } from '@/services/pushToken';
import { useWorkspaceRealtime } from '@/services/realtime';
import { attachAuthDeepLinkHandler } from '@/services/authDeepLinks';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Splash } from '@/components/brand/Splash';

function AppStatusBar() {
  const theme = useTheme();
  return <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />;
}

function RootNavigator() {
  const { session, isLoading } = useSession();
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId);
  const hasSeenWelcome = useOnboardingStore((s) => s.hasSeenWelcome);

  useWorkspaceRealtime(session ? activeWorkspaceId : null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (userId) {
      configurePurchases(userId);
      registerPushToken(userId);
    } else {
      logOutPurchases();
      unregisterCurrentPushToken();
      // activeWorkspaceId, cihazda hesaptan bağımsız (global) bir AsyncStorage anahtarında
      // kalıcı — çıkış yapılıp başka bir hesapla giriş yapıldığında temizlenmezse, önceki
      // hesabın çalışma alanı ID'si yeni hesaba uygulanmaya devam ediyordu: o ID artık
      // listMyWorkspaces()'te olmadığından ad "—" görünüyor, yazma denemeleri de RLS'e
      // takılıp yanlışlıkla "viewer" rol mesajı gösteriyordu (asıl sorun rol değil, yanlış
      // çalışma alanı). Oturum kapanınca sıfırlanır; app/(tabs)/index.tsx'teki mevcut efekt
      // yeni hesabın kendi ilk çalışma alanını otomatik seçer.
      setActiveWorkspaceId(null);
    }
  }, [session?.user?.id, setActiveWorkspaceId]);

  if (isLoading) return <Splash />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.backgroundPrimary },
      }}
    >
      {/* docs/03-bilgi-mimarisi-ekranlar.md §5.2 — üç değer önerisi ekranı yalnızca ilk
          açılışta ve oturum yokken (auth) grubundan önce gösterilir. */}
      <Stack.Protected guard={!session && !hasSeenWelcome}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="workspace-setup" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="accounts" />
        <Stack.Screen name="accounts/new" />
        <Stack.Screen name="accounts/[id]" />
        <Stack.Screen name="accounts/credit-cards" />
        <Stack.Screen name="transactions/new" />
        <Stack.Screen name="transactions/[id]" />
        <Stack.Screen name="obligations/new" />
        <Stack.Screen name="obligations/index" />
        <Stack.Screen name="obligations/[id]" />
        <Stack.Screen name="documents/[id]/review" />
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="profile/index" />
        <Stack.Screen name="subscription/index" />
        <Stack.Screen name="paywall/index" />
        <Stack.Screen name="categories/index" />
        <Stack.Screen name="categories/new" />
        <Stack.Screen name="counterparties/index" />
        <Stack.Screen name="counterparties/new" />
        <Stack.Screen name="counterparties/[id]" />
        <Stack.Screen name="reports/index" />
        <Stack.Screen name="banks/[code]" />
        <Stack.Screen name="workspace/[id]/members" />
        <Stack.Screen name="workspace/join" />
      </Stack.Protected>

      {/* Oturum durumundan bağımsız her zaman erişilebilir — App Store gizlilik beyanı ve
          tara.tsx'teki OCR izin ekranı buraya bağlantı verir (bkz. app/legal/privacy-policy.tsx).
          Stack'in en başında değil sonunda tanımlanır: React Navigation, `initialRouteName`
          verilmediğinde ilk sıradaki Screen'i örtük varsayılan/initial route sayıyor — bu
          bilgilendirme ekranı en başta olunca web'de "/" ve diğer tüm derin bağlantılar önce
          yanlışlıkla buraya mount oluyordu (bkz. git geçmişi — kaydedilmiş bir teşhis notu). */}
      <Stack.Screen name="legal/privacy-policy" />
      <Stack.Screen name="legal/terms-of-service" />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initDatabase().catch((error) => {
      console.error('SQLite migration hatası', error);
    });
    const detachFocusManager = attachFocusManager();
    const detachAuthDeepLinks = attachAuthDeepLinkHandler();
    return () => {
      detachFocusManager();
      detachAuthDeepLinks();
    };
  }, []);

  return (
    <ThemeProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister }}
        onSuccess={() => {
          queryClient.resumePausedMutations();
        }}
      >
        <AppStatusBar />
        <RootNavigator />
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}
