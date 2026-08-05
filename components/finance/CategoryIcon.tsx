import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getCategoryIconColor } from '@/features/categories/categoryIcons';

export interface CategoryIconProps {
  icon?: string | null;
  size?: number;
}

// BankLogo/PersonAvatar ile aynı yuvarlatılmış-kare kimlik dili — kategoriler de artık
// jenerik tek renkli ikon yerine kendi rengiyle ayrışır (bkz. features/categories/categoryIcons.ts).
export function CategoryIcon({ icon, size = 36 }: CategoryIconProps) {
  const color = getCategoryIconColor(icon);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons
        name={(icon as keyof typeof Ionicons.glyphMap) || 'pricetag-outline'}
        size={size * 0.55}
        color="#FFFFFF"
      />
    </View>
  );
}
