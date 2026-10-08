import { useState } from 'react';
import { useRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, Pressable, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { redeemWorkspaceInvite } from '@/features/workspaces/members';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { queryKeys } from '@/services/queryKeys';
import { showErrorAlert, showSaveSuccess } from '@/utils/alerts';

// Davet kodları 8 karakterdir (workspace_invites.code).
const CODE_LENGTH = 8;

// Davet koduyla mevcut bir çalışma alanına katılma ekranı. Kod, davet linkinin (/join/<kod>)
// veya doğrudan paylaşılan kodun karşılığıdır; katılınca çalışma alanı listeye eklenir ve aktif olur.
export default function JoinWorkspaceScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const queryClient = useQueryClient();
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId);
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState((params.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

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

  const canSubmit = code.trim().length === CODE_LENGTH;

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader title="Çalışma alanına katıl" />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.screenEdge.standard, gap: theme.spacing.lg }}
        >
          <Text variant="body" color="textSecondary">
            Size gönderilen davet kodunu girin. Katıldığınızda çalışma alanının tüm verilerini rolünüze göre görür
            (veya düzenlersiniz).
          </Text>

          <Pressable accessibilityRole="button" accessibilityLabel="Davet kodu" onPress={() => inputRef.current?.focus()}>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              {Array.from({ length: CODE_LENGTH }, (_, i) => {
                const active = i === Math.min(code.length, CODE_LENGTH - 1) && focused;
                return (
                  <View
                    key={i}
                    style={{
                      width: 38,
                      height: 52,
                      borderRadius: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.colors.surfacePrimary,
                      borderWidth: 2,
                      borderColor: active ? theme.colors.brandPrimary : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: '600' }}>{code[i] ?? ''}</Text>
                  </View>
                );
              })}
            </View>
          </Pressable>
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={(text) => setCode(text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={CODE_LENGTH}
            accessibilityLabel="Davet kodu"
            style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
          />

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
