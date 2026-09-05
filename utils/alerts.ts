import { Alert, InteractionManager } from 'react-native';
import { router } from 'expo-router';

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

// Kayıt sonrası çökme sınıfının (Fabric `componentViewDescriptorWithTag` assertion'ı,
// cache invalidation + navigasyon save ekranı hâlâ mount'tayken çakışınca) tüm ekranlarda
// tek tip önlenmesi için ortak yardımcı. `navigate` başarı Alert'i kapanınca hemen çalışır;
// `deferred` (önbellek geçersizleştirme vb.) ekran geçişi etkileşim animasyonu bitene kadar
// InteractionManager ile ertelenir — böylece invalidation'ın tetiklediği yeniden render,
// unmount olan ekranla çakışmaz. obligations/new.tsx'teki elle yazılmış desen artık buradan
// gelir; yeni ekranlar da bunu kullanmalıdır.
export function showSaveSuccess(message: string, navigate: () => void, deferred?: () => void) {
  showSuccessAlert(message, () => {
    navigate();
    if (deferred) InteractionManager.runAfterInteractions(deferred);
  });
}

// Kaydetme/silme mutation'larının onError'ında tek tip hata bildirimi. Daha önce bazı
// create ekranlarında onError yoktu; hata yalnızca sessiz `isError` state'ine düşüyor,
// kullanıcı neden kaydedilmediğini göremiyordu (ör. RLS .single() throw'u).
//
// Rol bazlı yazma engeli (viewer): Supabase, salt-okunur bir üye yazmaya çalışınca RLS
// ihlali (kod 42501 / "row-level security") döndürür. Bu ham mesaj kullanıcıya anlamsız
// geldiği için burada tek noktadan anlaşılır bir metne çevrilir — böylece her yazma yolunu
// (hareket, borç, belge onayı vb.) ayrı ayrı gizlemeye gerek kalmadan tutarlı davranış olur.
// Sunucu tarafındaki plan limiti kontrolleri (bkz. supabase/migrations/
// 20260905130000_enforce_plan_limits.sql) hatayı makine tarafından ayırt edilebilir bir
// önekle fırlatır. Ham Postgres mesajı kullanıcıya gösterilmez; burada başlık + anlaşılır
// metin + doğrudan paywall'a giden bir eyleme çevrilir.
const PLAN_ERROR_MESSAGES: { code: string; title: string; message: string }[] = [
  {
    code: 'WORKSPACE_LIMIT_REACHED',
    title: 'Çalışma alanı limiti',
    message:
      'Ücretsiz planda tek çalışma alanı oluşturabilirsiniz. Birden fazla alan için planınızı yükseltin.',
  },
  {
    code: 'WORKSPACE_READ_ONLY',
    title: 'Çalışma alanı salt-okunur',
    message:
      'Ücretsiz planda tek çalışma alanı kullanılabilir. Bu alandaki verileriniz duruyor ve okunabiliyor; yeniden kayıt eklemek için planınızı yükseltin veya bu alanı birincil alan olarak seçin.',
  },
  {
    code: 'TEAM_PLAN_REQUIRED',
    title: 'Ekip özelliği',
    message: 'Ekip üyesi davet etmek İşletme planında kullanılabilir.',
  },
  {
    code: 'TEAM_LIMIT_REACHED',
    title: 'Ekip üyesi limiti',
    message: 'Bu çalışma alanı planınızın ekip üyesi limitine ulaştı.',
  },
];

function findPlanError(rawMessage: string) {
  return PLAN_ERROR_MESSAGES.find((entry) => rawMessage.includes(entry.code)) ?? null;
}

export function showErrorAlert(error: unknown, fallback = 'İşlem tamamlanamadı. Lütfen tekrar deneyin.') {
  const err = error as { message?: string; code?: string } | null;
  const rawMessage = err?.message ?? '';

  const planError = findPlanError(rawMessage);
  if (planError) {
    Alert.alert(planError.title, planError.message, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Planları gör', onPress: () => router.push('/paywall') },
    ]);
    return;
  }

  const isRlsDenied = err?.code === '42501' || /row-level security/i.test(rawMessage);
  if (isRlsDenied) {
    Alert.alert(
      'Yetki yok',
      'Bu çalışma alanında yalnızca görüntüleme yetkiniz var. Değişiklik yapmak için çalışma alanı sahibinden düzenleyici rolü isteyin.'
    );
    return;
  }
  Alert.alert('Hata', rawMessage || fallback);
}
