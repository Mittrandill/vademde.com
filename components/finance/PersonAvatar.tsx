import { Text, View } from 'react-native';

import { getAvatarColor, getInitials } from '@/utils/avatarColor';

export interface PersonAvatarProps {
  name: string;
  size?: number;
}

// Kişi/firma listelerinde fotoğraf yerine isimden türeyen, deterministik renkli baş harf
// avatarı — BankLogo/ServiceLogo'nun eşleşme olmayan kayıtlarda kullandığı aynı isimden
// renk/baş harf türetme mantığı (bkz. utils/avatarColor.ts), burada kişiler için.
// BankLogo ile aynı yuvarlatılmış-kare şekil dilini kullanır (kimlik bileşenleri
// tutarlı bir görsel aile oluşturur — daire vs kare karışıklığı olmaz).
export function PersonAvatar({ name, size = 36 }: PersonAvatarProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: getAvatarColor(name),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.36 }}>{getInitials(name)}</Text>
    </View>
  );
}
