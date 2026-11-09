import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AudioQuality,
  createAudioPlayer,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { useQueryClient } from '@tanstack/react-query';

import { AiGate } from '@/components/finance/AiGate';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { Button, Pressable, Stack, Text } from '@/components/primitives';
import { VoiceAssembly } from '@/components/voice/VoiceAssembly';
import { VoiceOrb } from '@/components/voice/VoiceOrb';
import { matchBankByName } from '@/features/banks/banks';
import { submitVoice, type VoiceQuestion, type VoiceResult } from '@/features/voice/api';
import { VOICE_CLIPS } from '@/features/voice/clips';
import { voiceDraftRoute, type VoiceDraft } from '@/features/voice/route';
import { useVoiceDraftStore } from '@/features/voice/store';
import { DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import { getLanguage, t } from '@/i18n';
import { queryKeys } from '@/services/queryKeys';
import { useReflowKey } from '@/services/reflow';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useTheme } from '@/theme';
import { friendlyErrorMessage } from '@/utils/alerts';

const VOICE_CONSENT_KEY = 'vademde-voice-consent-granted';
const MAX_SECONDS = 60;
const RECORDING_OPTIONS = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: {},
} as const;

type Phase = 'idle' | 'recording' | 'processing' | 'question' | 'assembling';

export default function VoiceScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ flex: 1, padding: theme.screenEdge.standard }}>
        <ScreenHeader inline title={t('voice.title')} leftLabel={{ label: t('common.close'), onPress: () => router.back() }} />
        <AiGate>
          <VoiceConsent>
            <VoiceAssistant />
          </VoiceConsent>
        </AiGate>
      </View>
    </SafeAreaView>
  );
}

function VoiceConsent({ children }: { children: React.ReactNode }) {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(VOICE_CONSENT_KEY).then((value) => setGranted(value === 'true')).catch(() => setGranted(false));
  }, []);
  if (granted === null) return null;
  if (granted) return <>{children}</>;
  return (
    <Stack gap="md" style={{ flex: 1, justifyContent: 'center' }}>
      <Text variant="sectionTitle">{t('voice.consentTitle')}</Text>
      <Text variant="body" color="textSecondary">{t('voice.consentBody')}</Text>
      <Button
        label={t('voice.allow')}
        onPress={() => {
          setGranted(true);
          AsyncStorage.setItem(VOICE_CONSENT_KEY, 'true').catch(() => undefined);
        }}
      />
      <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
    </Stack>
  );
}

function VoiceAssistant() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setStoredDraft = useVoiceDraftStore((s) => s.setDraft);
  const recorder = useAudioRecorder(RECORDING_OPTIONS as never);
  const recorderState = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [question, setQuestion] = useState<VoiceQuestion | null>(null);
  const draftRef = useRef<VoiceDraft | null>(null);
  const answeredRef = useRef<string[]>([]);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const stoppingRef = useRef(false);
  const mountedRef = useRef(true);
  const speechDoneRef = useRef(false);
  const animationDoneRef = useRef(false);
  const openFormRef = useRef<() => void>(() => undefined);
  const [assemblyMs, setAssemblyMs] = useState(1400);
  const [assemblyComplete, setAssemblyComplete] = useState(false);
  const seconds = Math.floor((recorderState.durationMillis ?? 0) / 1000);
  const [speaking, setSpeaking] = useState(false);
  const speechIdRef = useRef(0);
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const inputLevel = Math.max(0, Math.min(1, ((recorderState.metering ?? -60) + 50) / 42));

  const stopSpeech = useCallback(() => {
    Speech.stop();
    playerRef.current?.remove();
    playerRef.current = null;
  }, []);

  const speak = useCallback((text: string, onDone?: () => void) => {
    stopSpeech();
    const speechId = ++speechIdRef.current;
    setSpeaking(true);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(fallback);
      if (speechIdRef.current === speechId) setSpeaking(false);
      onDone?.();
    };
    // Ses motoru geri çağrı vermezse ekran takılı kalmasın.
    const fallback = setTimeout(finish, text.length * 110 + 2500);
    const language = getLanguage() === 'en' ? 'en' : 'tr';
    const clip = VOICE_CLIPS[`${language}:${text}`];
    if (clip !== undefined) {
      try {
        const player = createAudioPlayer(clip);
        playerRef.current = player;
        player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) finish();
        });
        player.play();
        return;
      } catch {
        playerRef.current = null;
      }
    }
    // Karşılığı olmayan veya oynatılamayan cümleler cihaz sesiyle okunur.
    Speech.speak(text, { language: language === 'en' ? 'en-US' : 'tr-TR', onDone: finish, onStopped: finish, onError: finish });
  }, [stopSpeech]);

  useEffect(() => {
    setStoredDraft(null);
    mountedRef.current = true;
    let cancelled = false;
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) speak(t('voice.greeting'));
      });
    return () => {
      cancelled = true;
      mountedRef.current = false;
      stopSpeech();
    };
  }, [setStoredDraft, speak, stopSpeech]);

  const handleResult = useCallback((result: VoiceResult) => {
    if (result.sessionId) {
      if (result.sessionId !== sessionIdRef.current) {
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaceEntitlements(workspaceId) }).catch(() => undefined);
        queryClient.invalidateQueries({ queryKey: ['ocr-usage'] }).catch(() => undefined);
      }
      sessionIdRef.current = result.sessionId;
    }
    draftRef.current = result.draft;
    answeredRef.current = result.answered;
    setMessage(result.acknowledgement);
    if (result.draft.kind === 'unsupported') {
      draftRef.current = null;
      speak(result.acknowledgement);
      setError(result.acknowledgement);
      setPhase('idle');
      return;
    }
    if (result.question) {
      setQuestion(result.question);
      setPhase('question');
      speak(result.question.prompt);
      return;
    }
    // Sembol, asistan konuşurken tamamlanır; form ikisi de bitince açılır.
    speechDoneRef.current = false;
    animationDoneRef.current = false;
    setAssemblyMs(Math.min(5000, Math.max(1400, result.acknowledgement.length * 70)));
    setAssemblyComplete(true);
    speak(result.acknowledgement, () => {
      speechDoneRef.current = true;
      if (animationDoneRef.current) openFormRef.current();
    });
    setQuestion(null);
    setPhase('assembling');
  }, [queryClient, speak, workspaceId]);

  const fail = useCallback((failure: unknown) => {
    setAssemblyComplete(false);
    setError(friendlyErrorMessage(failure, t('voice.unavailable')));
    setPhase(draftRef.current ? 'question' : 'idle');
  }, []);

  const start = useCallback(async () => {
    setError(null);
    stopSpeech();
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError(t('voice.permissionDenied'));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      stoppingRef.current = false;
      setPhase('recording');
    } catch (failure) {
      fail(failure);
    }
  }, [fail, recorder, stopSpeech]);

  const stop = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    if (!workspaceId) return;
    const durationSeconds = (recorder.currentTime ?? 0);
    setPhase('processing');
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!recorder.uri) throw new Error(t('voice.unavailable'));
      const file = new File(recorder.uri);
      const audioBase64 = await file.base64();
      file.delete();
      const followUpField = draftRef.current && question?.type === 'voice' ? question.field : undefined;
      const result = await submitVoice({
        workspaceId,
        sessionId: sessionIdRef.current,
        audioBase64,
        mimeType: 'audio/mp4',
        durationSeconds,
        draft: followUpField ? draftRef.current ?? undefined : undefined,
        field: followUpField,
        answered: answeredRef.current,
      });
      handleResult(result);
    } catch (failure) {
      fail(failure);
    }
  }, [fail, handleResult, question, recorder, workspaceId]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setTimeout(() => stop(), Math.max(0, MAX_SECONDS * 1000 - seconds * 1000));
    return () => clearTimeout(timer);
  }, [phase, seconds, stop]);

  const answerChip = async (value: string) => {
    if (!workspaceId || !draftRef.current || !question) return;
    setError(null);
    setPhase('processing');
    try {
      handleResult(await submitVoice({
        workspaceId,
        sessionId: sessionIdRef.current,
        draft: draftRef.current,
        field: question.field,
        value,
        answered: answeredRef.current,
      }));
    } catch (failure) {
      fail(failure);
    }
  };

  const skip = () => {
    if (!question) return;
    answerChip('').catch(() => undefined);
  };

  const openForm = useCallback(() => {
    const draft = draftRef.current;
    if (!draft || !mountedRef.current) return;
    const typeLabel = draft.documentType ? DOCUMENT_TYPE_LABEL[draft.documentType] : null;
    const route = voiceDraftRoute(draft, {
      bankCode: draft.bank ? matchBankByName(draft.bank) : null,
      title: [typeLabel, draft.counterpartyName ?? draft.bank].filter(Boolean).join(' — ') || null,
    });
    if (!route) return;
    setStoredDraft(draft);
    router.replace(route as never);
  }, [setStoredDraft]);

  useEffect(() => {
    openFormRef.current = openForm;
  }, [openForm]);

  const handleAssembled = useCallback(() => {
    animationDoneRef.current = true;
    if (speechDoneRef.current) openFormRef.current();
  }, []);

  const recording = phase === 'recording';
  const showMic = phase === 'idle' || recording || (phase === 'question' && question?.type === 'voice');

  return (
    <Stack gap="xl" style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      {phase === 'processing' || phase === 'assembling' ? (
        <VoiceAssembly complete={assemblyComplete} durationMs={assemblyMs} onComplete={handleAssembled} />
      ) : null}

      <Stack gap="xs" style={{ alignItems: 'center' }}>
        <Text variant="sectionTitle" style={{ textAlign: 'center' }}>
          {phase === 'question' ? question?.prompt
            : recording ? t('voice.listening')
            : phase === 'processing' ? t('voice.processing')
            : phase === 'assembling' ? message
            : t('voice.prompt')}
        </Text>
        {phase === 'idle' ? (
          <Text variant="body" color="textSecondary" style={{ textAlign: 'center' }}>{t('voice.example')}</Text>
        ) : null}
        {recording ? <Text variant="body" color="textSecondary" tabular>{`${seconds} / ${MAX_SECONDS}`}</Text> : null}
        {error ? <Text variant="body" color="danger" style={{ textAlign: 'center' }}>{error}</Text> : null}
      </Stack>

      {phase === 'question' && question?.type === 'chips' ? (
        <Stack gap="xs" style={{ alignSelf: 'stretch' }}>
          {question.options?.map((option) => (
            <Button key={option.value || 'none'} variant="secondary" label={option.label} onPress={() => answerChip(option.value)} />
          ))}
        </Stack>
      ) : null}

      {showMic ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recording ? t('voice.stop') : t('voice.start')}
          onPress={recording ? stop : start}
        >
          <VoiceOrb mode={recording ? 'listening' : speaking ? 'speaking' : 'idle'} level={inputLevel} />
        </Pressable>
      ) : null}

      {showMic ? (
        <Text variant="caption" color="textSecondary">{recording ? t('voice.tapToFinish') : t('voice.tapToTalk')}</Text>
      ) : null}

      {phase === 'question' && question?.type === 'voice' ? (
        <Button variant="text" label={t('voice.skip')} onPress={skip} />
      ) : null}
      {phase === 'idle' ? (
        <Button variant="text" label={t('voice.manual')} onPress={() => router.replace('/transactions/new')} />
      ) : null}
    </Stack>
  );
}
