import { supabase } from '@/services/supabase';
import { getLanguage, t } from '@/i18n';
import { localIsoDate } from '@/features/obligations/api';
import { PlusRequiredError } from '@/features/insights/api';

import type { VoiceDraft } from './route';

export interface VoiceQuestion {
  field: string;
  type: 'voice' | 'chips';
  prompt: string;
  options?: { value: string; label: string }[];
}

export interface VoiceResult {
  draft: VoiceDraft;
  answered: string[];
  question: VoiceQuestion | null;
  acknowledgement: string;
}

interface VoiceRequest {
  workspaceId: string;
  requestId: string;
  audioBase64?: string;
  mimeType?: string;
  durationSeconds?: number;
  draft?: VoiceDraft;
  field?: string;
  value?: string;
  answered?: string[];
}

async function errorCode(error: unknown): Promise<string | null> {
  const response = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
  try {
    return (await response?.json?.())?.error ?? null;
  } catch {
    return null;
  }
}

export async function submitVoice(request: VoiceRequest): Promise<VoiceResult> {
  const { data, error } = await supabase.functions.invoke('voice-intake', {
    body: { ...request, locale: getLanguage() === 'en' ? 'en' : 'tr', today: localIsoDate() },
  });
  if (error) {
    const code = await errorCode(error);
    if (code === 'plus_required') throw new PlusRequiredError();
    if (code === 'voice_quota_exceeded') throw new Error(t('voice.quotaExceeded'));
    if (code === 'audio_too_long') throw new Error(t('voice.tooLong'));
    throw new Error(t('voice.unavailable'));
  }
  return data as VoiceResult;
}
