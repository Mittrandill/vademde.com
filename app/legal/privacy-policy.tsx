import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';

interface Section {
  title: string;
  body: string;
}

// Bu metin, www.vademde.com/gizlilik ile birebir aynı tutulur (bkz. vademdeapp reposundaki
// src/routes/gizlilik.tsx) — App Store Connect'in "Gizlilik Politikası URL'si" alanı için o
// sayfa referans gösterilir, bu ekran uygulama içi erişimi sağlar. İki tarafta bir değişiklik
// yapılırsa diğerine de yansıtılmalıdır.
const SECTIONS: Section[] = [
  {
    title: '1. Veri Sorumlusu',
    body:
      '6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca kişisel verileriniz; ' +
      'veri sorumlusu sıfatıyla Turgut Akın Kaya (gerçek kişi — "DoTa Medya" markası altında ' +
      'faaliyet göstermektedir), Çeşme, İzmir, Türkiye adresinde (tam tebligat adresi talep ' +
      'üzerine paylaşılır) mukim, tarafından aşağıda açıklanan kapsamda işlenmektedir. ' +
      'İletişim: info@vademde.com, 0543 203 53 09.',
  },
  {
    title: '2. Toplanan Kişisel Veri Kategorileri',
    body:
      '• Hesap verileri: ad, e-posta adresi; Apple ile giriş kullanıyorsanız Apple tarafından ' +
      'paylaşılan kimlik bilgileri.\n' +
      '• Finansal belge verileri: taradığınız çek, senet, fatura, kredi ödeme planı, kredi kartı ' +
      'ekstresi ve benzeri belgelerin görüntüleri ile bu belgelerden okunan tutar, tarih, taraf, ' +
      'IBAN ve belge numarası gibi alanlar.\n' +
      '• Manuel girdiğiniz finansal kayıtlar: gelir, gider, borç, alacak, hesap, kategori ve ' +
      'kişi/firma bilgileri.\n' +
      '• Abonelik ve satın alma verileri: plan tercihiniz ve abonelik durumunuz. Kart numarası ' +
      'gibi ödeme bilgileriniz bizde saklanmaz; ödemeler doğrudan Apple App Store üzerinden ' +
      'işlenir.\n' +
      '• Cihaz ve kullanım verileri: uygulama sürümü, işletim sistemi, hata kayıtları ve bildirim ' +
      'izin durumu.',
  },
  {
    title: '3. İşleme Amaçları',
    body:
      'Hesabınızı oluşturmak, kimliğinizi doğrulamak ve oturumunuzu yönetmek; taradığınız ' +
      'belgeleri sınıflandırmak, belge üzerindeki tutar/tarih/taraf gibi alanları yapay zekâ ' +
      'destekli optik karakter tanıma (OCR) ile çıkarmak ve onayınıza sunmak; onayladığınız ' +
      'verilerden borç, alacak, gelir, gider ve vade kayıtları oluşturmak, vade takvimini ve ' +
      'hatırlatma bildirimlerini yönetmek; abonelik planınızı ve OCR kotanızı yönetmek, satın ' +
      'alma işlemlerini doğrulamak; hizmeti güvenli tutmak, hataları tespit etmek ve teknik ' +
      'destek sağlamak; yasal yükümlülüklerimizi yerine getirmek. Belgeleriniz üzerinde çalışan ' +
      'yapay zekâ hiçbir zaman kesin bir finansal kayıt oluşturmaz; her OCR sonucu, kayda ' +
      'dönüşmeden önce sizin gözden geçirmenize ve onayınıza sunulur.',
  },
  {
    title: '4. Hukuki Sebep',
    body:
      'Kişisel verileriniz KVKK m.5/2 kapsamında "bir sözleşmenin kurulması veya ifasıyla ' +
      'doğrudan ilgili olması" ve "veri sorumlusunun meşru menfaati" hukuki sebeplerine ' +
      'dayanılarak; belge görüntüsünün yurt dışında yerleşik yapay zekâ hizmetine (bkz. madde 5) ' +
      'aktarımı ise KVKK m.9 uyarınca uygulama içinde ayrıca alınan açık rızanıza dayanılarak ' +
      'işlenmektedir.',
  },
  {
    title: '5. Verilerinizi Kimlerle Paylaşıyoruz',
    body:
      'Verilerinizi pazarlama amacıyla üçüncü taraflara satmayız. Hizmeti sunabilmek için ' +
      'aşağıdaki hizmet sağlayıcılarla sınırlı ve amacına uygun veri paylaşımı yapılır:\n' +
      '• Supabase Inc. — veritabanı, kimlik doğrulama ve dosya depolama altyapısı; hesap ve ' +
      'finansal kayıt verileriniz, çalışma alanınıza özel erişim politikalarıyla (satır bazlı ' +
      'güvenlik) izole şekilde saklanır.\n' +
      '• Google (Gemini API) — belge görüntüleriniz, yalnızca alan çıkarımı amacıyla ve sizin ' +
      'onayınızdan sonra sunucu tarafından bu servise iletilir; erişim anahtarı hiçbir zaman ' +
      'mobil uygulamaya gömülmez.\n' +
      '• RevenueCat ve Apple App Store — abonelik durumunuzu doğrulamak ve yönetmek için ' +
      'kullanılır.\n' +
      '• Apple (Sign in with Apple, bildirimler) — giriş yapmayı ve size bildirim göndermeyi ' +
      'sağlar.\n' +
      'Bu hizmet sağlayıcılar Türkiye dışında sunucu barındırabilir; bu durumda aktarım KVKK m.9 ' +
      'kapsamındaki açık rızanıza dayanır. Yasal bir zorunluluk olmadıkça verileriniz bu ' +
      'listenin dışında üçüncü kişilerle paylaşılmaz.',
  },
  {
    title: '6. Veri Güvenliği',
    body:
      '• Her çalışma alanının verisi, satır bazlı güvenlik (RLS) politikalarıyla diğer çalışma ' +
      'alanlarından tamamen izole edilir.\n' +
      '• Belgeleriniz herkese açık olmayan, özel bir depolama alanında tutulur; erişim yalnızca ' +
      'kısa süreli, imzalı bağlantılarla sağlanır.\n' +
      '• Oturum bilgileriniz cihazınızda şifreli bir güvenli depoda (Keychain/Keystore) tutulur.\n' +
      '• Servis anahtarları ve model API anahtarları istemci uygulamasına hiçbir zaman ' +
      'gömülmez; belge analizi yalnızca sunucu tarafında yürütülür.\n' +
      '• Veriler aktarım sırasında şifrelenir (TLS).',
  },
  {
    title: '7. Veri Saklama Süresi',
    body:
      'Finansal kayıtlarınız (tutar, tarih, taraf bilgisi gibi yapılandırılmış veriler), ilgili ' +
      'kaydı veya çalışma alanınızı silmediğiniz sürece saklanır. Taradığınız belgenin ham ' +
      'görüntüsü ise Profil > Gizlilik bölümündeki tercihinize göre saklanır: "Taranan ' +
      'belgeleri sakla" açıksa siz silene kadar; kapalıysa (varsayılan) yapay zekâ analizi ' +
      'tamamlanır tamamlanmaz otomatik olarak silinir. Hesabınızı sildiğinizde tüm veriler ' +
      '(belgeler dahil) kalıcı olarak silinir; yasal olarak saklanması zorunlu kayıtlar ' +
      'hariçtir.',
  },
  {
    title: '8. Haklarınız (KVKK m.11)',
    body:
      'KVKK m.11 uyarınca; kişisel verinizin işlenip işlenmediğini öğrenme, işlenmişse buna ' +
      'ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını ' +
      'öğrenme, yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme, eksik/yanlış ' +
      'işlenmişse düzeltilmesini isteme, KVKK m.7 şartları oluştuğunda silinmesini/yok ' +
      'edilmesini isteme, yapılan işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme, ' +
      'münhasıran otomatik sistemlerle analiz edilmesi suretiyle aleyhinize bir sonuç ortaya ' +
      'çıkmasına itiraz etme ve zarara uğramanız hâlinde tazminat talep etme haklarına ' +
      'sahipsiniz. Bu haklarınızı kullanmak için info@vademde.com adresine kimliğinizi tevsik ' +
      'edici bilgilerle yazılı olarak başvurabilirsiniz; başvurunuz en geç 30 gün içinde ' +
      'sonuçlandırılır. Ayrıca hesabınızı ve tüm verilerinizi uygulama içinden (Profil > ' +
      'Hesabımı ve Verilerimi Sil) dilediğiniz an doğrudan silebilirsiniz.',
  },
  {
    title: '9. Çocukların Gizliliği',
    body:
      'Hizmet, 18 yaş altındaki kişilere yönelik değildir ve bilerek çocuklardan kişisel veri ' +
      'toplamayız. 18 yaşından küçük bir kullanıcının verilerini topladığımızı fark edersek bu ' +
      'veriyi sileriz.',
  },
  {
    title: '10. Politika Değişiklikleri',
    body:
      'Bu politikayı zaman zaman güncelleyebiliriz. Önemli değişiklikleri uygulama içi bildirim ' +
      'veya e-posta yoluyla duyururuz. Güncel sürüm her zaman uygulama içinde ve ' +
      'www.vademde.com/gizlilik adresinde yayınlanır.',
  },
  {
    title: '11. İletişim',
    body: 'Gizlilikle ilgili sorularınız için: info@vademde.com veya 0543 203 53 09.',
  },
];

export default function PrivacyPolicyScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader
          title="Gizlilik Politikası"
          left={{ icon: 'close', accessibilityLabel: 'Kapat', onPress: () => router.back() }}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <Stack gap="xxs">
          <Text variant="pageTitle">Gizlilik Politikası ve KVKK Aydınlatma Metni</Text>
          <Text variant="caption" color="textSecondary">
            Son güncelleme: 11 Ağustos 2026
          </Text>
        </Stack>

        {SECTIONS.map((section) => (
          <Stack key={section.title} gap="xs">
            <Text variant="sectionTitle">{section.title}</Text>
            <Text variant="body" color="textSecondary">
              {section.body}
            </Text>
          </Stack>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
