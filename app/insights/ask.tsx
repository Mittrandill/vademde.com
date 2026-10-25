import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { MAX_FONT_SCALE } from '@/theme/typography';
import { useReflowKey } from '@/services/reflow';
import { Group, GroupedRow, Pressable, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { AiGate } from '@/components/finance/AiGate';
import { askAi, type AiAnswer } from '@/features/insights/api';
import { aiDisclaimer } from '@/features/insights/useAiAccess';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { friendlyErrorMessage } from '@/utils/alerts';
import { t } from '@/i18n';

const SUGGESTION_KEYS = ['insights.suggestion1', 'insights.suggestion2', 'insights.suggestion3'] as const;

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  source?: AiAnswer['source'];
}

// design AiSohbet.html. Yanıtlar ai-ask edge function'ından gelir: salt-okunur, yalnızca
// çalışma alanının özetlenmiş kayıtlarına dayanır; kaynak bilgisi (kayıt sayısı + dönem) sunucuda hesaplanır.
export default function AskScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ padding: theme.screenEdge.standard, paddingBottom: 0 }}>
          <ScreenHeader title={t('insights.askTitle')} />
        </View>
        <View style={{ flex: 1, padding: theme.screenEdge.standard }}>
          <AiGate>
            <Chat />
          </AiGate>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Chat() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const idRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  const mutation = useMutation({
    mutationFn: (question: string) => askAi(activeWorkspaceId as string, question),
    onSuccess: (result) =>
      setMessages((m) => [...m, { id: ++idRef.current, role: 'assistant', text: result.answer, source: result.source }]),
    onError: (error) =>
      setMessages((m) => [
        ...m,
        { id: ++idRef.current, role: 'assistant', text: friendlyErrorMessage(error, t('insights.noAnswer')) },
      ]),
  });

  function send(text: string) {
    const question = text.trim();
    if (!question || mutation.isPending || !activeWorkspaceId) return;
    setMessages((m) => [...m, { id: ++idRef.current, role: 'user', text: question }]);
    setInput('');
    mutation.mutate(question);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <Stack gap="sm">
            <Text variant="body" color="textSecondary">
              {t('insights.askIntro')}
            </Text>
            <Group inset={16}>
              {SUGGESTION_KEYS.map((key) => (
                <GroupedRow key={key} title={t(key)} onPress={() => send(t(key))} />
              ))}
            </Group>
          </Stack>
        ) : null}

        {messages.map((m) =>
          m.role === 'user' ? (
            <View
              key={m.id}
              style={{
                alignSelf: 'flex-end',
                maxWidth: '85%',
                padding: theme.spacing.sm + 2,
                borderRadius: theme.radius.widget,
                backgroundColor: theme.colors.action,
              }}
            >
              <Text variant="body" style={{ color: theme.colors.onAction }}>
                {m.text}
              </Text>
            </View>
          ) : (
            <View key={m.id} style={{ gap: theme.spacing.xs }}>
              <Text variant="label" color="textSecondary">
                Vademde
              </Text>
              <Text variant="body">{m.text}</Text>
              {m.source ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="document-text-outline" size={theme.iconSize.md} color={theme.colors.textSecondary} />
                  <Text variant="caption" color="textSecondary">
                    {t('insights.source', { count: m.source.count, from: m.source.from, to: m.source.to })}
                  </Text>
                </View>
              ) : null}
            </View>
          )
        )}
        {mutation.isPending ? (
          <Text variant="caption" color="textSecondary">
            {t('insights.analyzingDots')}
          </Text>
        ) : null}
      </ScrollView>

      <Text variant="caption" color="textSecondary" style={{ marginBottom: theme.spacing.xs }}>
        {aiDisclaimer()} {t('insights.answerDisclaimer')}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
          paddingLeft: theme.spacing.md,
          borderRadius: 16,
          backgroundColor: theme.colors.surfacePrimary,
        }}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={t('insights.placeholder')}
          placeholderTextColor={theme.colors.mutedControl}
          maxLength={400}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          returnKeyType="send"
          onSubmitEditing={() => send(input)}
          style={[theme.typography.body, { flex: 1, color: theme.colors.textPrimary, minHeight: theme.buttonHeight.primary }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('insights.send')}
          onPress={() => send(input)}
          disabled={mutation.isPending || !input.trim()}
          style={{
            width: theme.touchTarget.minimum,
            height: theme.touchTarget.minimum,
            marginRight: 6,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.action,
            opacity: mutation.isPending || !input.trim() ? theme.opacity.disabled : 1,
          }}
        >
          <Ionicons name="arrow-up" size={22} color={theme.colors.onAction} />
        </Pressable>
      </View>
    </View>
  );
}
