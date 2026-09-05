import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

export interface BiometricSupport {
  available: boolean;
  /** Kullanıcıya gösterilecek ad: "Face ID", "Touch ID", "Biyometrik kilit". */
  label: string;
}

// Cihazın gerçekten ne desteklediği önemlidir: donanım yoksa veya kullanıcı hiç parmak
// izi/yüz kaydetmemişse ayar açılmamalı — açılırsa kullanıcı bir daha uygulamaya giremez.
export async function getBiometricSupport(): Promise<BiometricSupport> {
  if (Platform.OS === 'web') return { available: false, label: 'Biyometrik kilit' };

  try {
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    const label = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? Platform.OS === 'ios'
        ? 'Face ID'
        : 'Yüz tanıma'
      : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ? Platform.OS === 'ios'
          ? 'Touch ID'
          : 'Parmak izi'
        : 'Biyometrik kilit';

    return { available: hasHardware && isEnrolled, label };
  } catch {
    return { available: false, label: 'Biyometrik kilit' };
  }
}

// disableDeviceFallback=false: biyometrik başarısız olursa cihaz parolası istenir. Aksi
// halde yüzü tanınmayan kullanıcı (maske, karanlık, yaralı parmak) verisine hiç ulaşamazdı.
export async function authenticate(promptLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptLabel,
      cancelLabel: 'Vazgeç',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
