import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { SERVICE_GLYPHS } from '@/features/services/services';
import { getAvatarColor, getInitials } from '@/utils/avatarColor';

export interface ServiceLogoProps {
  serviceCode?: string | null;
  /** service_code eşleşmesi yoksa (statik listede olmayan bir abonelik) kırık görsel
   * yerine kaydın kendi başlığından baş harfli renkli avatar göstermek için kullanılır —
   * bkz. BankLogo'daki fallbackName ile aynı mantık. */
  fallbackName?: string | null;
  size?: number;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
}

// BankLogo'nun servis karşılığı: PNG require() yerine gömülü SVG path verisiyle
// (bkz. features/services/services.ts) resmi marka rengiyle çizilir.
export function ServiceLogo({ serviceCode, fallbackName, size = 36, fallbackIcon = 'repeat' }: ServiceLogoProps) {
  const theme = useTheme();
  const glyph = serviceCode ? SERVICE_GLYPHS[serviceCode] : undefined;
  const showInitials = !glyph && !!fallbackName?.trim();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: glyph ? `#${glyph.hex}` : showInitials ? getAvatarColor(fallbackName!.trim()) : theme.colors.accentViolet,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {glyph ? (
        <Svg width={size * 0.6} height={size * 0.6} viewBox={glyph.viewBox}>
          <Path d={glyph.path} fill="#FFFFFF" />
        </Svg>
      ) : showInitials ? (
        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.36 }}>
          {getInitials(fallbackName!.trim())}
        </Text>
      ) : (
        <Ionicons name={fallbackIcon} size={size * 0.6} color="#FFFFFF" />
      )}
    </View>
  );
}
