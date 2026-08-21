import { Text } from '@/components/primitives';

// Web platform.web.tsx varyantı: @howincodes/expo-dynamic-app-icon native modülü web'de
// bulunmadığından (bkz. index.web.js'in kendisi de no-op döner), Metro bu dosyayı native
// varyant yerine seçip modülü hiç import etmez — aksi halde global scope'ta import anında çöker.
export function AppIconPicker() {
  return (
    <Text variant="caption" color="textSecondary">
      Uygulama ikonu yalnızca iOS uygulamasında değiştirilebilir.
    </Text>
  );
}
