import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { Stack, Text } from '@/components/primitives';
import { ScreenHeader, type ScreenHeaderProps } from './ScreenHeader';

export interface DetailScaffoldProps {
  header: ScreenHeaderProps;
  isLoading: boolean;
  /** Yükleniyor durumunda gösterilecek gösterge (ör. ActivityIndicator). Ekrana özel,
      opsiyonel — bazı ekranlar yükleniyorken hiçbir şey göstermiyor. */
  loadingIndicator?: ReactNode;
  error?: unknown;
  errorFallbackMessage?: string;
  children: ReactNode;
}

// obligations/[id], counterparties/[id], banks/[code], transactions/[id] ve accounts/[id]
// (kredi kartı dalı) ekranlarının ortak SafeAreaView + ScrollView + loading/error iskeleti.
export function DetailScaffold({
  header,
  isLoading,
  loadingIndicator,
  error,
  errorFallbackMessage,
  children,
}: DetailScaffoldProps) {
  const theme = useTheme();

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
        <Stack style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          {error ? (
            <Text variant="body" color="danger">
              {error instanceof Error ? error.message : (errorFallbackMessage ?? 'Kayıt yüklenemedi')}
            </Text>
          ) : (
            (loadingIndicator ?? null)
          )}
        </Stack>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView contentContainerStyle={{ padding: theme.screenEdge.standard, paddingBottom: theme.spacing.huge }}>
        <Stack gap="lg">
          <ScreenHeader {...header} />
          {children}
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}
