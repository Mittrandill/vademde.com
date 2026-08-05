import { Alert } from 'react-native';

// Kayıt/güncelleme/silme sonrası tek tip başarı bildirimi. onOk içine ekran geçişi ve
// önbellek geçersizleştirme konur (navigasyon hemen değil, kullanıcı "Tamam"a basınca
// tetiklenir) — bu sayede Alert'in kapanış animasyonuyla ekran geçişi aynı anda çalışıp
// Fabric'i çökertme riski oluşmaz (bkz. obligations/new.tsx ve obligations/[id].tsx'teki
// InteractionManager notları, aynı çakışmanın daha önce tespit edildiği yerler).
//
// Not: Alert.alert react-native-web'de no-op'tur (bkz. components/primitives/ActionSheet.tsx
// yorumu) — bu bildirim yalnızca iOS/Android'de görünür, web'de sessizce hiçbir şey yapmaz.
export function showSuccessAlert(message: string, onOk: () => void) {
  Alert.alert('Başarılı', message, [{ text: 'Tamam', onPress: onOk }]);
}
