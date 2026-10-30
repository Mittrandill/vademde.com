import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { MAX_FONT_SCALE } from '@/theme/typography';
import { useReflowKey } from '@/services/reflow';
import { ListError, ListSkeleton, Pressable, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { getSupportThread, markSupportRepliesRead, replyToSupportMessage } from '@/features/support/api';
import { queryKeys } from '@/services/queryKeys';
import { friendlyErrorMessage } from '@/utils/alerts';
import { localeDateFormatter } from '@/i18n/format';
import { t } from '@/i18n';

const stamp = localeDateFormatter({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

interface Bubble {
  id: string;
  mine: boolean;
  body: string;
  createdAt: string;
}

// Destek sohbeti (insights/ask ile aynı balon düzeni). İlk balon talebin kendisidir; ardından
// support_replies sırayla gelir. Ekran açıldığında okunmamış destek cevapları okundu işaretlenir.
export default function SupportThreadScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const messageId = typeof id === 'string' ? id : '';
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const threadQuery = useQuery({
    queryKey: queryKeys.supportThread(messageId),
    queryFn: () => getSupportThread(messageId),
    enabled: !!messageId,
  });

  const hasUnread = (threadQuery.data?.replies ?? []).some((r) => r.sender === 'support' && !r.read_at);
  useEffect(() => {
    if (!hasUnread) return;
    markSupportRepliesRead(messageId)
      .then(() => queryClient.invalidateQueries({ queryKey: ['support'] }))
      .catch(() => {});
  }, [hasUnread, messageId, queryClient]);

  const mutation = useMutation({
    mutationFn: (body: string) => replyToSupportMessage(messageId, body),
    onSuccess: async () => {
      setInput('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.supportThreads() });
    },
  });

  function send() {
    const body = input.trim();
    if (!body || mutation.isPending) return;
    mutation.mutate(body);
  }

  const data = threadQuery.data;
  const bubbles: Bubble[] = data
    ? [
        { id: data.message.id, mine: true, body: data.message.message, createdAt: data.message.created_at },
        ...data.replies.map((r) => ({ id: r.id, mine: r.sender === 'user', body: r.body, createdAt: r.created_at })),
      ]
    : [];
  const awaitingReply = !!data && !data.replies.some((r) => r.sender === 'support');

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ padding: theme.screenEdge.standard, paddingBottom: 0 }}>
          <ScreenHeader title={data?.message.subject ?? t('support.title')} />
        </View>
        <View style={{ flex: 1, padding: theme.screenEdge.standard }}>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {threadQuery.isLoading ? (
              <ListSkeleton rows={2} />
            ) : threadQuery.error ? (
              <ListError
                message={friendlyErrorMessage(threadQuery.error, t('support.threadLoadFailed'))}
                onRetry={() => void threadQuery.refetch()}
              />
            ) : null}

            {bubbles.map((b) =>
              b.mine ? (
                <View key={b.id} style={{ alignSelf: 'flex-end', maxWidth: '85%', gap: 4, alignItems: 'flex-end' }}>
                  <View
                    style={{
                      padding: theme.spacing.sm + 2,
                      borderRadius: theme.radius.widget,
                      backgroundColor: theme.colors.action,
                    }}
                  >
                    <Text variant="body" style={{ color: theme.colors.onAction }}>
                      {b.body}
                    </Text>
                  </View>
                  <Text variant="caption" color="textSecondary">
                    {t('support.you')} · {stamp.format(new Date(b.createdAt))}
                  </Text>
                </View>
              ) : (
                <View key={b.id} style={{ maxWidth: '85%', gap: 4 }}>
                  <Text variant="label" color="textSecondary">
                    {t('support.supportTeam')}
                  </Text>
                  <View
                    style={{
                      padding: theme.spacing.sm + 2,
                      borderRadius: theme.radius.widget,
                      backgroundColor: theme.colors.surfacePrimary,
                    }}
                  >
                    <Text variant="body">{b.body}</Text>
                  </View>
                  <Text variant="caption" color="textSecondary">
                    {stamp.format(new Date(b.createdAt))}
                  </Text>
                </View>
              )
            )}

            {awaitingReply ? (
              <Text variant="caption" color="textSecondary">
                {t('support.awaitingReply')}
              </Text>
            ) : null}
          </ScrollView>

          {mutation.error ? (
            <Text variant="caption" color="danger" style={{ marginBottom: theme.spacing.xs }}>
              {friendlyErrorMessage(mutation.error, t('support.sendFailed'))}
            </Text>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: theme.spacing.xs,
              paddingLeft: theme.spacing.md,
              paddingVertical: 6,
              borderRadius: 16,
              backgroundColor: theme.colors.surfacePrimary,
            }}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={t('support.replyPlaceholder')}
              placeholderTextColor={theme.colors.mutedControl}
              maxLength={5000}
              multiline
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              editable={!!data}
              style={[
                theme.typography.body,
                { flex: 1, color: theme.colors.textPrimary, minHeight: theme.touchTarget.minimum, maxHeight: 140, paddingTop: 10 },
              ]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('support.sendA11y')}
              onPress={send}
              disabled={mutation.isPending || !input.trim() || !data}
              style={{
                width: theme.touchTarget.minimum,
                height: theme.touchTarget.minimum,
                marginRight: 6,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.action,
                opacity: mutation.isPending || !input.trim() || !data ? theme.opacity.disabled : 1,
              }}
            >
              <Ionicons name="arrow-up" size={22} color={theme.colors.onAction} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
