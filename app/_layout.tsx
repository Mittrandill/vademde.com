import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

import { ThemeProvider, useTheme } from '@/theme';
import { useSession } from '@/features/auth/useSession';
import { initDatabase } from '@/db';
import { asyncStoragePersister, attachFocusManager, queryClient } from '@/services/queryClient';
import { configurePurchases, logOutPurchases } from '@/services/purchases';
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
  const hasSeenWelcome = useOnboardingStore((s) => s.hasSeenWelcome);

  useWorkspaceRealtime(session ? activeWorkspaceId : null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (userId) {
      configurePurchases(userId);
    } else {
      logOutPurchases();
    }
  }, [session?.user?.id]);

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
      {/* Oturum durumundan bağımsız her zaman erişilebilir — App Store gizlilik beyanı ve
          tara.tsx'teki OCR izin ekranı buraya bağlantı verir (bkz. app/legal/privacy-policy.tsx). */}
      <Stack.Screen name="legal/privacy-policy" options={{ presentation: 'modal' }} />
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
        <Stack.Screen name="accounts" options={{ presentation: 'modal' }} />
        <Stack.Screen name="accounts/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="accounts/[id]" />
        <Stack.Screen name="accounts/credit-cards" options={{ presentation: 'modal' }} />
        <Stack.Screen name="transactions/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="transactions/[id]" />
        <Stack.Screen name="obligations/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="obligations/index" options={{ presentation: 'modal' }} />
        <Stack.Screen name="obligations/[id]" />
        <Stack.Screen name="documents/[id]/review" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings/index" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profile/index" options={{ presentation: 'modal' }} />
        <Stack.Screen name="subscription/index" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall/index" options={{ presentation: 'modal' }} />
        <Stack.Screen name="categories/index" options={{ presentation: 'modal' }} />
        <Stack.Screen name="categories/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="counterparties/index" options={{ presentation: 'modal' }} />
        <Stack.Screen name="counterparties/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="counterparties/[id]" />
        <Stack.Screen name="banks/[code]" />
        <Stack.Screen name="workspace/[id]/members" options={{ presentation: 'modal' }} />
        <Stack.Screen name="workspace/join" options={{ presentation: 'modal' }} />
      </Stack.Protected>
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
