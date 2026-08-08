import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getCategoryIconColor } from '@/features/categories/categoryIcons';

export interface CategoryIconProps {
  icon?: string | null;
  /** Kullanıcının kategori düzenlemede bağımsız olarak seçtiği renk (bkz.
   * app/categories/new.tsx) — verilmezse eski kayıtlar için ikondan türetilen renge düşülür. */
  color?: string | null;
  size?: number;
}

// BankLogo/PersonAvatar ile aynı yuvarlatılmış-kare kimlik dili — kategoriler de artık
// jenerik tek renkli ikon yerine kendi rengiyle ayrışır (bkz. features/categories/categoryIcons.ts).
export function CategoryIcon({ icon, color, size = 36 }: CategoryIconProps) {
  const resolvedColor = color ?? getCategoryIconColor(icon);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: resolvedColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons
        name={(icon as keyof typeof Ionicons.glyphMap) || 'pricetag'}
        size={size * 0.55}
        color="#FFFFFF"
      />
    </View>
  );
}
