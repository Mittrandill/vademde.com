import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, Text, TextField } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { createSupportMessage } from '@/features/support/api';
import { useSession } from '@/features/auth/useSession';
import { queryKeys } from '@/services/queryKeys';
import { friendlyErrorMessage } from '@/utils/alerts';
import { t } from '@/i18n';

export default function NewSupportRequestScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: () => createSupportMessage(session?.user.id as string, subject.trim(), message.trim()),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.supportThreads() });
      router.replace(`/destek/${id}`);
    },
  });

  const canSubmit = !!session?.user.id && subject.trim().length > 0 && message.trim().length > 0 && !mutation.isPending;

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.screenEdge.standard, gap: theme.spacing.lg, paddingBottom: theme.spacing.massive }}
        >
          <ScreenHeader title={t('support.newTitle')} />
          <TextField
            label={t('support.subject')}
            placeholder={t('support.subjectPlaceholder')}
            value={subject}
            onChangeText={setSubject}
            maxLength={200}
          />
          <TextField
            label={t('support.message')}
            placeholder={t('support.messagePlaceholder')}
            value={message}
            onChangeText={setMessage}
            maxLength={5000}
            multiline
            textAlignVertical="top"
            style={{ minHeight: 160 }}
          />
          {mutation.error ? (
            <Text variant="caption" color="danger">
              {friendlyErrorMessage(mutation.error, t('support.sendFailed'))}
            </Text>
          ) : null}
          <Button label={t('support.send')} onPress={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
