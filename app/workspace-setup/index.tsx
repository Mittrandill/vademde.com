import { useState } from 'react';
import { InteractionManager, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { AmountField, Button, SegmentedControl, Stack, Text, TextField } from '@/components/primitives';
import { OnboardingWorkspaceIllustration } from '@/components/brand/OnboardingWorkspaceIllustration';
import { setupInitialWorkspaces } from '@/features/workspaces/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { parseAmountToMinor } from '@/utils/money';
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
  const reflowKey = useReflowKey();
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
      const balance = openingBalance.trim();
      // Tüm oluşturma tek atomik RPC'de yapılır (bkz. setupInitialWorkspaces); 'both'
      // modunda yarım kalma riski yoktur.
      return setupInitialWorkspaces({
        mode,
        name: isBoth ? null : trimmedName,
        openingBalanceMinor: !isBoth && balance ? parseAmountToMinor(balance) ?? 0 : null,
      });
    },
    onSuccess: (primaryWorkspaceId: string) => {
      // review.tsx'teki aynı Fabric çakışması: invalidation ve navigasyon aynı anda/ters
      // sırada tetiklenirse ekran hâlâ mount'tayken arkadaki view çöküyor. Navigasyon hemen
      // (senkron), invalidation bir sonraki etkileşim turuna ertelenir.
      setActiveWorkspaceId(primaryWorkspaceId);
      router.replace('/(tabs)');
      InteractionManager.runAfterInteractions(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() });
      });
    },
  });

  // Butonun aynı frame içinde iki kez tetiklenip (isPending henüz true olmadan) iki/dört
  // kopya çalışma alanı oluşturmasını engelleyen ek koruma.
  const handleSubmit = () => {
    if (setupMutation.isPending) return;
    setupMutation.mutate();
  };

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
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
                <AmountField
                  label="BAŞLANGIÇ BAKİYESİ (İSTEĞE BAĞLI)"
                  placeholder="0,00"
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
              onPress={handleSubmit}
              loading={setupMutation.isPending}
              disabled={!canSubmit}
            />
          </Stack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
