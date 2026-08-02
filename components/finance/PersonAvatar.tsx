import { Text, View } from 'react-native';

import { getBankAvatarColor, getBankInitials } from '@/features/banks/banks';

export interface PersonAvatarProps {
  name: string;
  size?: number;
}

// Kişi/firma listelerinde fotoğraf yerine isimden türeyen, deterministik renkli baş harf
// avatarı — BankLogo'nun banka eşleşmesi olmayan hesaplarda kullandığı aynı isimden
// renk/baş harf türetme mantığı (bkz. features/banks/banks.ts), burada kişiler için.
export function PersonAvatar({ name, size = 40 }: PersonAvatarProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: getBankAvatarColor(name),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.36 }}>{getBankInitials(name)}</Text>
    </View>
  );
}
