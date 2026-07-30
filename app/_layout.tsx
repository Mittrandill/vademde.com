import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

import { ThemeProvider, useTheme } from '@/theme';
import { useSession } from '@/features/auth/useSession';
import { initDatabase } from '@/db';
import { asyncStoragePersister, attachFocusManager, queryClient } from '@/services/queryClient';
import { useWorkspaceRealtime } from '@/services/realtime';
import { useWorkspaceStore } from '@/store/workspaceStore';

function RootNavigator() {
  const { session, isLoading } = useSession();
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  useWorkspaceRealtime(session ? activeWorkspaceId : null);

  if (isLoading) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.backgroundPrimary },
      }}
    >
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="accounts" options={{ presentation: 'modal' }} />
        <Stack.Screen name="accounts/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="transactions/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="obligations/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="obligations/[id]" />
        <Stack.Screen name="documents/[id]/review" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initDatabase().catch((error) => {
      console.error('SQLite migration hatası', error);
    });
    return attachFocusManager();
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
        <StatusBar style="auto" />
        <RootNavigator />
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}
