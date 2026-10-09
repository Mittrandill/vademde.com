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
    code: 'RECEIPT_ARCHIVE_PLAN_REQUIRED',
    title: 'Belge arşivi',
    message: 'Ödemelere dekont eklemek ve arşivlemek Plus planında kullanılabilir.',
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

const NETWORK_ERROR = /network request failed|fetch failed|failed to fetch|load failed|\bTLS\b|\bSSL\b|timed out|timeout|offline|internet connection|NSURLError|ECONN|ENOTFOUND|EAI_AGAIN|AbortError|güvenli bağlantı|bağlantı kesildi/i;
// Kullanıcıya anlamsız gelen teknik hata parçaları (Postgres/PostgREST/JS/native yığın izi).
const TECHNICAL_ERROR = /violates|duplicate key|PGRST|JSON|syntax error|relation "|column "|does not exist|null value|Exception|TypeError|ReferenceError|undefined|is not a function|Cannot read|permission denied|invalid input|\.swift:\d+|\.kt:\d+|\.java:\d+/i;
export const NETWORK_ERROR_MESSAGE = 'İnternet bağlantısı kurulamadı. Bağlantınızı kontrol edip tekrar deneyin.';

export function isNetworkError(error: unknown): boolean {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && NETWORK_ERROR.test(message);
}

// Hata nesnesini kullanıcıya gösterilebilir tek bir Türkçe cümleye çevirir: bağlantı hataları
// sabit bir metne, teknik/İngilizce ham mesajlar `fallback`'e düşer; sunucunun Türkçe iş kuralı
// mesajları (ör. "Ödeme güncel kalan tutarı aşıyor") olduğu gibi kalır. Ekranlar hata metnini
// doğrudan `error.message` ile değil bununla göstermelidir.
export function friendlyErrorMessage(error: unknown, fallback = 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'): string {
  const err = error as { message?: unknown; code?: unknown } | null;
  const raw = typeof err?.message === 'string' ? err.message.replace(/^(\w*Error:\s*)+/, '').trim() : '';
  if (!raw) return fallback;
  if (NETWORK_ERROR.test(raw)) return NETWORK_ERROR_MESSAGE;
  const planError = findPlanError(raw);
  if (planError) return planError.message;
  if (err?.code === '42501' || /row-level security/i.test(raw)) {
    return 'Bu çalışma alanında yalnızca görüntüleme yetkiniz var.';
  }
  if (TECHNICAL_ERROR.test(raw)) return fallback;
  return raw;
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
  if (isNetworkError(error)) {
    Alert.alert('Bağlantı yok', NETWORK_ERROR_MESSAGE);
    return;
  }
  Alert.alert('İşlem tamamlanamadı', friendlyErrorMessage(error, fallback));
}
