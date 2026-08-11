import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as aesjs from 'aes-js';

// docs/07-guvenlik-gizlilik.md §11.1 — "Oturum bilgilerinin güvenli depolamada tutulması".
// SecureStore (iOS Keychain / Android Keystore) tek başına yetmez: Supabase'in oturum JSON'u
// (access+refresh token, kullanıcı bilgisi) Keychain'in tek öğe için ~2KB sınırını aşabiliyor.
// Bu yüzden Supabase'in kendi önerdiği desen izlenir: değer AES ile şifrelenip AsyncStorage'a
// yazılır (boyut sınırı yok), şifreleme anahtarı ise (yalnızca 32 bayt, sınıra rahat sığar)
// SecureStore'da tutulur. Diskte/yedekte kalan AsyncStorage verisi anahtar olmadan okunamaz.
class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = Crypto.getRandomBytes(256 / 8);
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));

    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;

    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));

    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    // Şifre çözme anahtarı bulunamazsa (ör. uygulama Keychain'i temizleyip AsyncStorage'ı
    // koruyan bir eski yedekten geri yüklendiyse) bozuk veriyle patlamak yerine null dönülür —
    // supabase-js bunu "oturum yok" sayıp kullanıcıyı normal şekilde tekrar giriş ekranına düşürür.
    try {
      return await this.decrypt(key, encrypted);
    } catch {
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }
}

export const largeSecureStore = new LargeSecureStore();
