import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';

import { getMySubscription } from '@/features/subscriptions/api';
import { queryKeys } from '@/services/queryKeys';

// docs/07-guvenlik-gizlilik.md §11.2 — kayıt özetleri yapay zekâ hizmetine gönderilmeden önce
// "Akıllı Tarama İzni"nden AYRI bir onay alınır (KVKK). Onay cihazda tutulur.
export const AI_CONSENT_KEY = 'vademde-ai-insights-consent-granted';

export const AI_CONSENT_TEXT =
  'Önerileri ve yanıtları üretmek için hareket ve vade kayıtlarının özeti güvenli bağlantı üzerinden akıllı analiz hizmetine gönderilir. Belge görselleri gönderilmez. Rakamlar kayıtlarından hesaplanır; hiçbir şey sen onaylamadan değişmez.';

export const AI_DISCLAIMER = 'Öneriler bilgilendirme amaçlıdır; yatırım veya kredi tavsiyesi değildir.';

export interface AiAccess {
  /** Plan ve onay bilgisi yüklenene kadar false. */
  ready: boolean;
  isPlus: boolean;
  consentGranted: boolean;
  grantConsent: () => Promise<void>;
}

export function useAiAccess(): AiAccess {
  const subscriptionQuery = useQuery({ queryKey: queryKeys.subscription(), queryFn: getMySubscription });
  const [consent, setConsent] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(AI_CONSENT_KEY)
      .then((value) => setConsent(value === '1'))
      .catch(() => setConsent(false));
  }, []);

  const grantConsent = useCallback(async () => {
    await AsyncStorage.setItem(AI_CONSENT_KEY, '1').catch(() => {});
    setConsent(true);
  }, []);

  return {
    ready: subscriptionQuery.isSuccess && consent !== null,
    isPlus: (subscriptionQuery.data?.plan ?? 'free') !== 'free',
    consentGranted: consent === true,
    grantConsent,
  };
}
