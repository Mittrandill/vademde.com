import { Stack, Text } from '@/components/primitives';
import { VademdeMark } from './VademdeMark';

export interface AuthHeaderProps {
  markSize?: number;
}

// Splash, giriş ve kayıt ekranlarında ortak marka başlığı: sembol + wordmark + slogan.
export function AuthHeader({ markSize = 56 }: AuthHeaderProps) {
  return (
    <Stack gap="xs" align="center">
      <VademdeMark size={markSize} />
      <Text variant="sectionTitle" style={{ fontWeight: '700' }}>
        Vademde
      </Text>
      <Text
        variant="caption"
        color="accentViolet"
        style={{ letterSpacing: 1.2, fontWeight: '600' }}
      >
        BİLGİN. DENGEN. GELECEĞİN.
      </Text>
    </Stack>
  );
}
