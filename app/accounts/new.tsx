import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, Pressable, Row, Stack, Text, TextField } from '@/components/primitives';
import { BankPicker } from '@/components/finance/BankPicker';
import { createAccount, type Account } from '@/features/accounts/api';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { toMinorUnits } from '@/utils/money';
import { formatIbanInput, isValidIbanFormat, normalizeIban } from '@/utils/iban';
import { queryKeys } from '@/services/queryKeys';

const TYPES: Array<{ value: Account['type']; label: string }> = [
  { value: 'cash', label: 'Kasa' },
  { value: 'bank', label: 'Banka' },
  { value: 'wallet', label: 'Cüzdan' },
];

export default function NewAccountScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>('cash');
  const [bankCode, setBankCode] = useState<string | null>(null);
  const [iban, setIban] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');

  const normalizedIban = normalizeIban(iban);
  const ibanHasError = normalizedIban.length > 0 && !isValidIbanFormat(normalizedIban);

  const createAccountMutation = useMutation({
    mutationFn: () =>
      createAccount({
        workspace_id: activeWorkspaceId as string,
        name: name.trim(),
        type,
        bank_code: type === 'bank' ? bankCode : null,
        iban: type === 'bank' && normalizedIban ? normalizedIban : null,
        opening_balance_minor: openingBalance ? toMinorUnits(Number(openingBalance.replace(',', '.'))) : 0,
      }),
    onSuccess: () => {
      if (activeWorkspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts(activeWorkspaceId) });
      }
      router.back();
    },
  });

  function handleSubmit() {
    if (!activeWorkspaceId || !name.trim()) return;
    createAccountMutation.mutate();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Stack gap="lg" style={{ flex: 1, padding: theme.screenEdge.standard }}>
          <Row align="center">
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
            </Pressable>
            <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
              Yeni Hesap
            </Text>
          </Row>

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              HESAP ADI
            </Text>
            <TextField placeholder="Örn. Nakit Kasa" value={name} onChangeText={setName} />
          </Stack>

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              HESAP TÜRÜ
            </Text>
            <Row gap="xs">
              {TYPES.map((option) => {
                const selected = option.value === type;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setType(option.value)}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: theme.spacing.sm,
                      borderRadius: theme.radius.input,
                      backgroundColor: selected ? theme.colors.brandPrimary : theme.colors.surfacePrimary,
                    }}
                  >
                    <Text
                      variant="body"
                      style={{ color: selected ? theme.colors.brandPrimaryText : theme.colors.textPrimary }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
          </Stack>

          {type === 'bank' ? (
            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                BANKA (İSTEĞE BAĞLI)
              </Text>
              <BankPicker selectedId={bankCode} onSelect={setBankCode} />
            </Stack>
          ) : null}

          {type === 'bank' ? (
            <Stack gap="sm">
              <Text variant="caption" color="textSecondary">
                IBAN (İSTEĞE BAĞLI)
              </Text>
              <TextField
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                value={iban}
                onChangeText={(value) => setIban(formatIbanInput(value))}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={32}
              />
              {ibanHasError ? (
                <Text variant="caption" color="danger">
                  IBAN "TR" ile başlamalı ve 26 karakter olmalı.
                </Text>
              ) : null}
            </Stack>
          ) : null}

          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              AÇILIŞ BAKİYESİ (İSTEĞE BAĞLI)
            </Text>
            <TextField
              placeholder="0,00"
              keyboardType="decimal-pad"
              value={openingBalance}
              onChangeText={setOpeningBalance}
            />
          </Stack>

          {createAccountMutation.error ? (
            <Text variant="caption" color="danger">
              {createAccountMutation.error instanceof Error
                ? createAccountMutation.error.message
                : 'Hesap oluşturulamadı'}
            </Text>
          ) : null}

          <Button
            label="Hesabı Kaydet"
            onPress={handleSubmit}
            loading={createAccountMutation.isPending}
            disabled={!name.trim()}
          />
        </Stack>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
