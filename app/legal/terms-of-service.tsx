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

// TASLAK METİN — taraf bilgileri (Turgut Akın Kaya, gerçek kişi — "DoTa Medya") dolduruldu,
// ancak bu ekran bir avukat tarafından incelenmeden yayına alınmamalıdır (bkz. app/legal/
// privacy-policy.tsx'teki aynı uyarı). App Store Review Guideline 3.1.2 — otomatik yenilenen
// abonelik satan her ekran (bkz. app/paywall/index.tsx) Kullanım Koşulları'na işlevsel bir
// bağlantı içermek zorundadır; bu sayfa o gereksinimi karşılar.
const SECTIONS: Section[] = [
  {
    title: '1. Taraflar ve Kabul',
    body:
      'Bu Kullanım Koşulları ("Koşullar"), Turgut Akın Kaya (gerçek kişi — "DoTa Medya" markası ' +
      'altında faaliyet göstermektedir; "Vademde", "biz") ile Vademde uygulamasını ("Uygulama") ' +
      'indiren, kaydolan veya kullanan kişi ("Kullanıcı", "siz") ' +
      'arasındaki ilişkiyi düzenler. Uygulamayı kullanarak bu Koşulları ve Gizlilik Politikası ve ' +
      'KVKK Aydınlatma Metnini kabul etmiş olursunuz; kabul etmiyorsanız Uygulamayı kullanmayın.',
  },
  {
    title: '2. Hizmetin Tanımı',
    body:
      'Vademde; çek, senet, fatura, kredi ödeme planı ve diğer finansal belgeleri kullanıcı ' +
      'onayıyla borç, alacak, gelir, gider ve vade kaydına dönüştüren bir kişisel/işletme finans ' +
      'takip uygulamasıdır. Vademde bir banka, ödeme kuruluşu, yatırım danışmanı veya muhasebe ' +
      'firması değildir; hiçbir ödemeyi taraflar adına yürütmez, saklamaz veya garanti etmez — ' +
      'yalnızca sizin girdiğiniz veya onayladığınız kayıtları takip eden bir araçtır.',
  },
  {
    title: '3. Hesap ve Kullanıcı Sorumlulukları',
    body:
      'Hesabınızın ve çalışma alanınızın güvenliğinden (Apple/Google ile giriş veya e-posta/şifre) ' +
      'siz sorumlusunuz. Girdiğiniz veya belge taramasıyla onayladığınız finansal bilgilerin ' +
      'doğruluğundan siz sorumlusunuz — Uygulama, oluşturduğunuz kayıtları sizin onayınız olmadan ' +
      'değiştirmez veya üçüncü kişilerle paylaşmaz (çalışma alanı üyeleriniz hariç). Bir çalışma ' +
      'alanına başka kullanıcıları davet ederseniz, onlarla paylaştığınız verilerin sorumluluğu size ' +
      'aittir.',
  },
  {
    title: '4. Abonelik, Ücretlendirme ve Otomatik Yenileme',
    body:
      'Premium özellikler yalnızca Apple App Store uygulama içi satın alma sistemiyle sunulur. ' +
      'Abonelik ücreti, Uygulama içinde satın alma ekranında gösterilen süre ve fiyat üzerinden, ' +
      'geçerli dönemin bitiminden en az 24 saat önce iptal etmediğiniz sürece otomatik olarak ' +
      'yenilenir ve Apple hesabınızdan tahsil edilir. Ödeme, yenileme onayı için Apple ID hesabınıza ' +
      'işlem tamamlandığında yansıtılır. Aboneliği Ayarlar uygulamasındaki Apple ID abonelik ' +
      'yönetiminden istediğiniz zaman iptal edebilirsiniz; iptal, mevcut dönemin sonunda geçerli olur.',
  },
  {
    title: '5. İptal ve İade',
    body:
      'Tüm satın alma ve iade işlemleri Apple App Store üzerinden yürütülür; iade talepleri ' +
      'Apple’ın kendi politikalarına ve https://reportaproblem.apple.com adresine tabidir. ' +
      'Vademde, App Store dışında doğrudan iade işlemi gerçekleştiremez.',
  },
  {
    title: '6. Yapay Zekâ / OCR Sonuçlarının Doğruluğu',
    body:
      'Belge tarama (OCR) ve yapay zekâ destekli alan çıkarımı bir yardımcı araçtır; sonuçlar hiçbir ' +
      'zaman kesin doğru kabul edilmez ve siz onaylamadan finansal kayda dönüşmez (bkz. Gizlilik ' +
      'Politikası madde 3-4). Düşük güvenilirlikli alanlar işaretlenir, ancak nihai doğruluk ' +
      'kontrolü ve onay sorumluluğu size aittir. Vademde, OCR/yapay zekâ çıktısındaki hatalardan ' +
      'kaynaklanan yanlış kayıt, kaçırılan ödeme veya benzeri sonuçlardan sorumlu tutulamaz.',
  },
  {
    title: '7. Yasaklı Kullanım',
    body:
      'Uygulamayı yasa dışı amaçlarla, başkasına ait finansal belgeleri izinsiz işlemek için, ' +
      'Uygulamanın güvenliğini aşmaya/tersine mühendislik yapmaya çalışarak veya hizmetin normal ' +
      'işleyişini bozacak şekilde (aşırı otomatik istek, kötü amaçlı dosya yükleme vb.) ' +
      'kullanamazsınız.',
  },
  {
    title: '8. Fikri Mülkiyet',
    body:
      'Uygulamanın tasarımı, yazılımı, marka ve logosu Turgut Akın Kaya’ya (DoTa Medya) aittir. ' +
      'Girdiğiniz finansal veriler ve yüklediğiniz belgeler size aittir; bunları dilediğiniz zaman ' +
      'silebilirsiniz (bkz. Gizlilik Politikası madde 6-7).',
  },
  {
    title: '9. Sorumluluğun Sınırlandırılması',
    body:
      'Uygulama "olduğu gibi" sunulur. Yürürlükteki mevzuatın izin verdiği azami ölçüde, Vademde; ' +
      'veri kaybı, kaçırılan ödeme/vade, kâr kaybı veya dolaylı zararlardan sorumlu tutulamaz. Bu ' +
      'sınırlama, kastın veya ağır kusurun kanunen sorumluluk doğurduğu hâllerde uygulanmaz.',
  },
  {
    title: '10. Hizmetin Sona Ermesi',
    body:
      'Hesabınızı ve tüm verilerinizi Uygulama içinden dilediğiniz an kalıcı olarak silebilirsiniz ' +
      '(Profil > Hesabımı ve Verilerimi Sil). Bu Koşulları ihlal ettiğinizi tespit etmemiz hâlinde ' +
      'hesabınızı askıya alabilir veya sonlandırabiliriz; bu durumda sizi bilgilendiririz.',
  },
  {
    title: '11. Değişiklikler',
    body:
      'Bu Koşulları güncelleyebiliriz; önemli değişikliklerde Uygulama içinde bilgilendirme ' +
      'yapılır. Güncellemeden sonra Uygulamayı kullanmaya devam etmeniz, güncel Koşulları kabul ' +
      'ettiğiniz anlamına gelir.',
  },
  {
    title: '12. Uygulanacak Hukuk ve Yetki',
    body:
      'Bu Koşullar Türkiye Cumhuriyeti kanunlarına tabidir; uyuşmazlıklarda İzmir Mahkemeleri ve ' +
      'İcra Daireleri yetkilidir.',
  },
  {
    title: '13. İletişim',
    body: 'Sorularınız için info@vademde.com adresinden veya 0543 203 53 09 numaralı telefondan bize ulaşabilirsiniz.',
  },
];

export default function TermsOfServiceScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader
          title="Kullanım Koşulları"
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
              Bu metin, uygulamanın mevcut abonelik/OCR akışını yansıtacak şekilde hazırlanmış bir
              başlangıç taslağıdır. Taraf gerçek kişi (Turgut Akın Kaya, &quot;DoTa Medya&quot; markası)
              olarak dolduruldu — vergi mükellefiyeti/kayıt durumu netleşince (mali müşavir onayı) bu
              bölüm gerekirse güncellenmelidir. Yayına almadan önce bir avukata onaylatılmalıdır.
            </Text>
          </Stack>
        </Card>

        <Stack gap="xxs">
          <Text variant="pageTitle">Kullanım Koşulları</Text>
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
