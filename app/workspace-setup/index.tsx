import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { OnboardingWorkspaceIllustration } from '@/components/brand/OnboardingWorkspaceIllustration';
import { createWorkspace, type Workspace } from '@/features/workspaces/api';
import { createAccount } from '@/features/accounts/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { toMinorUnits } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';

type WorkspaceMode = 'personal' | 'business' | 'both';

const MODE_OPTIONS: { key: WorkspaceMode; label: string }[] = [
  { key: 'personal', label: 'Kişisel' },
  { key: 'business', label: 'İşletme' },
  { key: 'both', label: 'Her ikisi' },
];

const DEFAULT_NAME: Record<'personal' | 'business', string> = {
  personal: 'Kişisel Bütçe',
  business: 'İşletme Bütçe',
};

// docs/03-bilgi-mimarisi-ekranlar.md §5.2 — onboarding'in son adımı: çalışma alanı türü,
// adı ve isteğe bağlı başlangıç bakiyesi. Oturum açmış ama hiç çalışma alanı olmayan
// kullanıcılar buraya yönlendirilir (bkz. app/(tabs)/index.tsx).
export default function WorkspaceSetupScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId);

  const [mode, setMode] = useState<WorkspaceMode>('personal');
  const [name, setName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');

  const isBoth = mode === 'both';
  const trimmedName = name.trim();
  const canSubmit = isBoth || trimmedName.length > 0;

  const setupMutation = useMutation({
    mutationFn: async () => {
      if (isBoth) {
        const [personal, business] = await Promise.all([
          createWorkspace({ name: 'Kişisel', type: 'personal' }),
          createWorkspace({ name: 'İşletme', type: 'business' }),
        ]);
        return { primary: personal, created: [personal, business] };
      }

      const workspace = await createWorkspace({ name: trimmedName, type: mode });

      const balance = openingBalance.trim();
      if (balance) {
        await createAccount({
          workspace_id: workspace.id,
          name: 'Kasa',
          type: 'cash',
          opening_balance_minor: toMinorUnits(Number(balance.replace(',', '.'))),
        });
      }

      return { primary: workspace, created: [workspace] };
    },
    onSuccess: ({ primary }: { primary: Workspace; created: Workspace[] }) => {
      setActiveWorkspaceId(primary.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
      router.replace('/(tabs)');
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.screenEdge.standard, flexGrow: 1, justifyContent: 'center' }}
        >
          <Stack gap="xl" align="center">
            <OnboardingWorkspaceIllustration size={140} />

            <Stack gap="xs" align="center">
              <Text variant="pageTitle" style={{ textAlign: 'center' }}>
                Çalışma Alanını Kur
              </Text>
              <Text variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
                Kişisel veya işletme bütçenizi takip etmek için bir çalışma alanı oluşturun.
              </Text>
            </Stack>

            <Stack gap="sm" style={{ alignSelf: 'stretch' }}>
              <Text variant="caption" color="textSecondary">
                NASIL KULLANACAKSINIZ?
              </Text>
              <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} stretch />
            </Stack>

            {isBoth ? (
              <Text variant="caption" color="textSecondary" style={{ alignSelf: 'stretch' }}>
                &ldquo;Kişisel&rdquo; ve &ldquo;İşletme&rdquo; adıyla iki ayrı çalışma alanı oluşturulur;
                adlarını ve başlangıç bakiyelerini daha sonra Ayarlar&apos;dan düzenleyebilirsiniz.
              </Text>
            ) : (
              <Stack gap="sm" style={{ alignSelf: 'stretch' }}>
                <TextField
                  label="ÇALIŞMA ALANI ADI"
                  placeholder={DEFAULT_NAME[mode]}
                  value={name}
                  onChangeText={setName}
                />
                <TextField
                  label="BAŞLANGIÇ BAKİYESİ (İSTEĞE BAĞLI)"
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                  value={openingBalance}
                  onChangeText={setOpeningBalance}
                />
              </Stack>
            )}

            {setupMutation.error ? (
              <Text variant="caption" color="danger">
                {setupMutation.error instanceof Error ? setupMutation.error.message : 'Bir hata oluştu'}
              </Text>
            ) : null}

            <Button
              label="Çalışma Alanını Oluştur"
              onPress={() => setupMutation.mutate()}
              loading={setupMutation.isPending}
              disabled={!canSubmit}
            />
          </Stack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
