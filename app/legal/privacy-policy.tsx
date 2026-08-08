import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Stack, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';

interface Section {
  title: string;
  body: string;
}

// TASLAK METİN — bu ekran bir avukat tarafından incelenmeden ve aşağıdaki [DOLDURULACAK]
// alanları gerçek şirket bilgileriyle doldurulmadan yayına alınmamalıdır. Bkz. sohbet geçmişi:
// docs/07-guvenlik-gizlilik.md §11.2/§11.3'te tanımlanan OCR izni ve saklama tercihinin KVKK
// karşılığı olarak hazırlanmıştır; App Store Connect'in "Gizlilik Politikası URL'si" alanı
// için ayrıca bu metnin bir web sayfasında da yayınlanması gerekir (bu ekran yalnızca
// uygulama içi erişim sağlar).
const SECTIONS: Section[] = [
  {
    title: '1. Veri Sorumlusu',
    body:
      '6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca kişisel verileriniz; ' +
      'veri sorumlusu sıfatıyla [DOLDURULACAK: Şirket Unvanı], [DOLDURULACAK: Adres], ' +
      'MERSİL/Ticaret Sicil No: [DOLDURULACAK], KEP adresi: [DOLDURULACAK] tarafından, ' +
      'aşağıda açıklanan kapsamda işlenmektedir.',
  },
  {
    title: '2. İşlenen Kişisel Veri Kategorileri',
    body:
      '• Kimlik ve iletişim verisi: ad soyad, e-posta (Apple/Google ile giriş veya e-posta ile kayıt).\n' +
      '• Finansal veri: hesap, işlem, borç/alacak, çek/senet/fatura/kredi kartı ekstresi kayıtları ve tutarları.\n' +
      '• Belge görüntüsü: taradığınız veya yüklediğiniz çek, senet, fatura, kredi/kredi kartı ekstresi gibi belgelerin fotoğraf/PDF görüntüsü.\n' +
      '• Kullanım verisi: uygulama içi işlem kayıtları, hata/çökme raporları (Apple TestFlight/App Store üzerinden, e-posta adresiniz dahil).',
  },
  {
    title: '3. İşleme Amaçları',
    body:
      'Belge görüntüsünden tarih, tutar ve ödeme bilgilerini yapay zekâ destekli optik karakter ' +
      'tanıma (OCR) ile çıkarmak; bu bilgileri siz onaylamadan hiçbir finansal kayda dönüştürmeden ' +
      'önizlemenizi sağlamak; oluşturduğunuz finansal kayıtları saklamak, size vade/ödeme ' +
      'hatırlatmaları göndermek; hesabınızı ve çalışma alanınızı yönetmek; abonelik/satın alma ' +
      'işlemlerini yürütmek; uygulama güvenliğini ve hata giderimini sağlamak.',
  },
  {
    title: '4. Hukuki Sebep',
    body:
      'Kişisel verileriniz KVKK m.5/2 kapsamında "bir sözleşmenin kurulması veya ifasıyla doğrudan ' +
      'ilgili olması" ve "veri sorumlusunun meşru menfaati" hukuki sebeplerine dayanılarak; belge ' +
      'görüntüsünün yurt dışında yerleşik yapay zekâ hizmetine (bkz. madde 5) aktarımı ise KVKK ' +
      'm.9 uyarınca uygulama içinde ayrıca alınan açık rızanıza dayanılarak işlenmektedir.',
  },
  {
    title: '5. Aktarılan Taraflar ve Yurt Dışı Aktarım',
    body:
      '• Supabase Inc. — veritabanı, kimlik doğrulama ve belge depolama altyapısı (bulut barındırma).\n' +
      '• Google (Gemini API) — belge görüntüsünün OCR/yapay zekâ ile analizi; yalnızca uygulama içi ' +
      'onayınızdan sonra, belge görüntüsü gönderilir.\n' +
      '• RevenueCat / Apple App Store — abonelik ve satın alma işlemlerinin yürütülmesi.\n' +
      'Bu hizmet sağlayıcılar Türkiye dışında sunucu barındırabilir; bu durumda aktarım KVKK m.9 ' +
      'kapsamındaki açık rızanıza dayanır.',
  },
  {
    title: '6. Saklama Süresi',
    body:
      'Finansal kayıtlarınız (tutar, tarih, taraf bilgisi gibi yapılandırılmış veriler) çalışma ' +
      'alanınızı veya ilgili kaydı silmediğiniz sürece saklanır. Taradığınız belgenin ham görüntüsü ' +
      'ise Profil > Gizlilik bölümündeki tercihinize göre: "Belgeleri işlem sonrasında sakla" ' +
      'açıksa siz silene kadar, kapalıysa belge onaylandıktan/iptal edildikten kısa süre sonra ' +
      'otomatik olarak silinir. Hesabınızı sildiğinizde tüm veriler (belgeler dahil) kalıcı olarak ' +
      'silinir.',
  },
  {
    title: '7. Haklarınız (KVKK m.11)',
    body:
      'KVKK m.11 uyarınca; kişisel verinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin ' +
      'bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt ' +
      'içinde/yurt dışında aktarıldığı üçüncü kişileri bilme, eksik/yanlış işlenmişse düzeltilmesini ' +
      'isteme, KVKK m.7 şartları oluştuğunda silinmesini/yok edilmesini isteme, yapılan işlemlerin ' +
      'aktarıldığı üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz ' +
      'edilmesi suretiyle aleyhinize bir sonuç ortaya çıkmasına itiraz etme ve zarara uğramanız ' +
      'hâlinde tazminat talep etme haklarına sahipsiniz. Uygulama içinden hesabınızı ve tüm ' +
      'verilerinizi dilediğiniz an kalıcı olarak silebilirsiniz (Profil > Hesabımı ve Verilerimi Sil).',
  },
  {
    title: '8. Başvuru Yöntemi',
    body:
      'Yukarıdaki haklarınızı kullanmak için [DOLDURULACAK: başvuru e-postası] adresine kimliğinizi ' +
      'tevsik edici bilgilerle yazılı olarak başvurabilirsiniz. Başvurunuz en geç 30 gün içinde ' +
      'sonuçlandırılır.',
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
        <Card style={{ backgroundColor: withAlpha(theme.colors.danger, 0.1) }}>
          <Stack gap="xs">
            <Text variant="body" style={{ color: theme.colors.danger, fontWeight: '700' }}>
              Taslak — hukuki inceleme gerektirir
            </Text>
            <Text variant="caption" color="textSecondary">
              Bu metin, koddaki mevcut veri işleme akışını (OCR, depolama, saklama tercihi) yansıtacak
              şekilde hazırlanmış bir başlangıç taslağıdır. Yayına almadan önce [DOLDURULACAK] ile
              işaretli alanlar gerçek şirket bilgileriyle doldurulmalı ve bir KVKK/kişisel verilerin
              korunması alanında uzman avukata onaylatılmalıdır.
            </Text>
          </Stack>
        </Card>

        <Stack gap="xxs">
          <Text variant="pageTitle">Gizlilik Politikası ve KVKK Aydınlatma Metni</Text>
          <Text variant="caption" color="textSecondary">
            Son güncelleme: [DOLDURULACAK: tarih]
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
