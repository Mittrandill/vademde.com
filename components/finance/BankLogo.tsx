import { Image, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { BANK_LOGOS, getBankAvatarColor, getBankInitials } from '@/features/banks/banks';

export interface BankLogoProps {
  bankCode?: string | null;
  /** bank_code eşleşmesi yoksa (OCR'ın çıkardığı ama statik listede olmayan bir banka
   * adı) kırık görsel yerine baş harfli renkli avatar göstermek için kullanılır. */
  fallbackName?: string | null;
  size?: number;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
}

// docs/08-tasarim-sistemi.md §12.9 — hesap/kredi/kredi kartı/çek kayıtlarında özel banka
// logosu; eşleşen banka yoksa (fallbackName varsa) baş harfli avatara, yoksa çağıranın
// verdiği belge/hesap türü ikonuna düşer, böylece kırık görsel yerine anlamlı bir şey kalır.
export function BankLogo({ bankCode, fallbackName, size = 32, fallbackIcon = 'business-outline' }: BankLogoProps) {
  const theme = useTheme();
  const source = bankCode ? BANK_LOGOS[bankCode] : undefined;
  const showInitials = !source && !!fallbackName?.trim();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: showInitials ? getBankAvatarColor(fallbackName!.trim()) : theme.colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {source ? (
        <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />
      ) : showInitials ? (
        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.36 }}>
          {getBankInitials(fallbackName!.trim())}
        </Text>
      ) : (
        <Ionicons name={fallbackIcon} size={size * 0.6} color={theme.colors.accentViolet} />
      )}
    </View>
  );
}
