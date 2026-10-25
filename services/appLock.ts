import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import { t } from '@/i18n';

export type BiometricKind = 'faceId' | 'touchId' | 'face' | 'fingerprint' | 'generic';

export interface BiometricSupport {
  available: boolean;
  /** Kullanıcıya gösterilecek ad biometricLabel(kind) ile çizim anında çözülür: sorgu önbelleğe
   * yazıldığı için ad burada saklansaydı dil değişince eski dilde kalırdı. */
  kind: BiometricKind;
}

/** "Face ID", "Touch ID", "Yüz tanıma", "Parmak izi", "Biyometrik kilit". */
export function biometricLabel(kind: BiometricKind | undefined): string {
  switch (kind) {
    case 'faceId':
      return 'Face ID';
    case 'touchId':
      return 'Touch ID';
    case 'face':
      return t('ui.appLock.faceRecognition');
    case 'fingerprint':
      return t('ui.appLock.fingerprint');
    default:
      return t('ui.appLock.biometric');
  }
}

// Cihazın gerçekten ne desteklediği önemlidir: donanım yoksa veya kullanıcı hiç parmak
// izi/yüz kaydetmemişse ayar açılmamalı — açılırsa kullanıcı bir daha uygulamaya giremez.
export async function getBiometricSupport(): Promise<BiometricSupport> {
  if (Platform.OS === 'web') return { available: false, kind: 'generic' };

  try {
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    const kind: BiometricKind = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? Platform.OS === 'ios'
        ? 'faceId'
        : 'face'
      : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ? Platform.OS === 'ios'
          ? 'touchId'
          : 'fingerprint'
        : 'generic';

    return { available: hasHardware && isEnrolled, kind };
  } catch {
    return { available: false, kind: 'generic' };
  }
}

// disableDeviceFallback=false: biyometrik başarısız olursa cihaz parolası istenir. Aksi
// halde yüzü tanınmayan kullanıcı (maske, karanlık, yaralı parmak) verisine hiç ulaşamazdı.
export async function authenticate(promptLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptLabel,
      cancelLabel: t('common.cancel'),
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
