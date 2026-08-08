import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, Card, Stack, Text, TextField } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { redeemWorkspaceInvite } from '@/features/workspaces/members';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { showErrorAlert, showSaveSuccess } from '@/utils/alerts';

// Davet koduyla mevcut bir çalışma alanına katılma ekranı. Kod, davet linkinin (/join/<kod>)
// veya doğrudan paylaşılan kodun karşılığıdır; katılınca çalışma alanı listeye eklenir ve aktif olur.
export default function JoinWorkspaceScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId);
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());

  const joinMutation = useMutation({
    mutationFn: () => redeemWorkspaceInvite(code),
    onSuccess: (workspaceId) => {
      showSaveSuccess('Çalışma alanına katıldınız.', () => router.replace('/(tabs)'), () => {
        setActiveWorkspaceId(workspaceId);
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
      });
    },
    onError: (error) => showErrorAlert(error),
  });

  const canSubmit = code.trim().length >= 4;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader title="Çalışma Alanına Katıl" />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.screenEdge.standard, gap: theme.spacing.lg }}
        >
          <Text variant="body" color="textSecondary">
            Sizi davet eden kişinin paylaştığı davet kodunu girin. Katıldığınızda çalışma alanının
            tüm verilerini rolünüze göre görür (veya düzenlersiniz).
          </Text>

          <Card>
            <Stack gap="sm">
              <TextField
                label="DAVET KODU"
                placeholder="ÖRN: 7QK4P2ZC"
                autoCapitalize="characters"
                autoCorrect={false}
                value={code}
                onChangeText={(text) => setCode(text.toUpperCase())}
              />
            </Stack>
          </Card>

          <Button
            label="Katıl"
            onPress={() => {
              if (!joinMutation.isPending) joinMutation.mutate();
            }}
            loading={joinMutation.isPending}
            disabled={!canSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
