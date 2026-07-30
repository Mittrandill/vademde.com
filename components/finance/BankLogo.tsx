import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { BANK_LOGOS } from '@/features/banks/banks';

export interface BankLogoProps {
  bankCode?: string | null;
  size?: number;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
}

// docs/08-tasarim-sistemi.md §12.9 — hesap/kredi/kredi kartı/çek kayıtlarında özel banka
// logosu; eşleşen banka yoksa çağıranın verdiği belge/hesap türü ikonuna (yoksa genel
// banka ikonuna) düşer, böylece kırık görsel yerine anlamlı bir ikon kalır.
export function BankLogo({ bankCode, size = 32, fallbackIcon = 'business-outline' }: BankLogoProps) {
  const theme = useTheme();
  const source = bankCode ? BANK_LOGOS[bankCode] : undefined;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: theme.colors.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {source ? (
        <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />
      ) : (
        <Ionicons name={fallbackIcon} size={size * 0.6} color={theme.colors.accentViolet} />
      )}
    </View>
  );
}
