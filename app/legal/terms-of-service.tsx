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

// Bu metin, www.vademde.com/kullanim-sartlari ile birebir aynı tutulur (bkz. vademdeapp
// reposundaki src/routes/kullanim-sartlari.tsx). App Store Review Guideline 3.1.2 — otomatik
// yenilenen abonelik satan her ekran (bkz. app/paywall/index.tsx) Kullanım Koşulları'na
// işlevsel bir bağlantı içermek zorundadır; bu sayfa o gereksinimi karşılar. İki tarafta bir
// değişiklik yapılırsa diğerine de yansıtılmalıdır.
const SECTIONS: Section[] = [
  {
    title: '1. Taraflar ve Kabul',
    body:
      'Bu Kullanım Koşulları ("Koşullar"), Turgut Akın Kaya (gerçek kişi — "DoTa Medya" markası ' +
      'altında faaliyet göstermektedir; "Vademde", "biz") tarafından sunulan Vademde mobil ' +
      'uygulaması ve www.vademde.com internet sitesinin ("Hizmet") kullanımını düzenler. ' +
      'Hizmeti indirerek, hesap oluşturarak veya kullanarak bu Koşulları ve Gizlilik Politikası ' +
      've KVKK Aydınlatma Metnini kabul etmiş sayılırsınız.',
  },
  {
    title: '2. Hizmetin Tanımı',
    body:
      'Vademde; çek, senet, fatura, kredi ödeme planı ve diğer finansal belgeleri kullanıcı ' +
      'onayıyla borç, alacak, gelir, gider ve vade kaydına dönüştüren bir kişisel/işletme ' +
      'finans takip uygulamasıdır. Vademde bir yatırım danışmanlığı, muhasebe, hukuk, vergi ' +
      'danışmanlığı veya bankacılık/ödeme hizmeti değildir; hiçbir ödemeyi taraflar adına ' +
      'yürütmez, saklamaz veya garanti etmez. Uygulama tarafından sunulan raporlar ve özetler ' +
      'yalnızca bilgilendirme amaçlıdır; finansal, hukuki veya vergisel kararlarınızı almadan ' +
      'önce yetkili bir uzmana danışmanız önerilir.',
  },
  {
    title: '3. Hesap Oluşturma ve Güvenlik',
    body:
      'Hizmeti kullanmak için Apple ile giriş veya e-posta ile hesap oluşturmanız gerekir. ' +
      'Hesap bilgilerinizin gizliliğinden ve hesabınız üzerinden gerçekleşen işlemlerden siz ' +
      'sorumlusunuz. Hesabınızda yetkisiz bir erişim şüphesi durumunda bizi info@vademde.com ' +
      'adresinden bilgilendirmelisiniz. Hizmeti yalnızca 18 yaşından büyükseniz ' +
      'kullanabilirsiniz. Bir çalışma alanına başka kullanıcıları davet ederseniz, onlarla ' +
      'paylaştığınız verilerin sorumluluğu size aittir.',
  },
  {
    title: '4. Belge Tarama, OCR ve Kullanıcı Onayı',
    body:
      'Taradığınız belgelerden yapay zekâ ile çıkarılan tutar, tarih, taraf ve benzeri alanlar, ' +
      'siz onaylamadan hiçbir zaman kesin bir finansal kayda dönüşmez. Düşük güvenle okunan ' +
      'alanlar uygulama içinde açıkça işaretlenir; bu alanları onaylamadan veya düzeltmeden ' +
      'önce doğruluğunu kontrol etmek sizin sorumluluğunuzdadır. Onayladığınız kayıtların ' +
      'doğruluğundan ve eksiksizliğinden siz sorumlusunuz; Vademde, OCR sonuçlarının veya sizin ' +
      'onayladığınız verilerin doğruluğunu garanti etmez ve OCR/yapay zekâ çıktısındaki ' +
      'hatalardan kaynaklanan yanlış kayıt, kaçırılan ödeme veya benzeri sonuçlardan sorumlu ' +
      'tutulamaz.',
  },
  {
    title: '5. Çalışma Alanları',
    body:
      'Kişisel ve işletme çalışma alanları birbirinden tamamen izoledir. Bir işletme çalışma ' +
      'alanına ekip üyesi olarak eklendiğinizde, o çalışma alanının verilerine erişebilirsiniz; ' +
      'bu erişimin sorumluluğu çalışma alanı sahibine aittir.',
  },
  {
    title: '6. Abonelik Planları ve Ödeme',
    body:
      'Vademde; Ücretsiz, Vademde Plus ve Vademde İşletme olmak üzere farklı abonelik planları ' +
      'sunar. Ücretli planlar yalnızca Apple App Store üzerinden uygulama içi satın alma (IAP) ' +
      'yoluyla satılır; fiyat ve süre bilgisi satın alma ekranında ve App Store listelemesinde ' +
      'gösterilir. Otomatik yenilenen abonelikler için aşağıdaki koşullar geçerlidir: ödeme, ' +
      'satın alma onayı verdiğinizde Apple ID hesabınıza yansıtılır; abonelik, mevcut dönem ' +
      'bitmeden en az 24 saat önce otomatik yenilemeyi kapatmadığınız sürece otomatik olarak ' +
      'yenilenir; yenileme ücreti mevcut dönemin bitiminden 24 saat önce hesabınızdan tahsil ' +
      'edilir; aboneliğinizi cihazınızdaki Ayarlar > Apple ID > Abonelikler bölümünden ' +
      'istediğiniz zaman yönetebilir ve otomatik yenilemeyi kapatabilirsiniz; ücretsiz deneme ' +
      'süresi sunulması hâlinde, deneme süresinin kullanılmayan kısmı ücretli bir abonelik ' +
      'satın aldığınızda geçersiz olur. Ödeme bilgileriniz (kart numarası vb.) Vademde ' +
      'tarafından saklanmaz; bu bilgiler doğrudan Apple tarafından işlenir.',
  },
  {
    title: '7. İptal ve İade',
    body:
      'Tüm satın alma ve iade işlemleri Apple App Store üzerinden yürütülür; iade talepleri ' +
      'Apple’ın kendi politikalarına ve https://reportaproblem.apple.com adresine tabidir. ' +
      'Vademde, App Store dışında doğrudan iade işlemi gerçekleştiremez.',
  },
  {
    title: '8. Kullanım Kuralları',
    body:
      'Hizmeti kullanırken şunları yapmamayı kabul edersiniz: hizmeti yasa dışı bir amaçla veya ' +
      'başkalarının haklarını ihlal edecek şekilde kullanmak; başkasına ait belge veya kimlik ' +
      'bilgilerini izinsiz yüklemek; hizmetin güvenliğini aşmaya, tersine mühendislik yapmaya ' +
      'veya kaynak koda erişmeye çalışmak; hizmeti otomatik araçlarla kötüye kullanmak veya ' +
      'aşırı yüklemek.',
  },
  {
    title: '9. Fikri Mülkiyet',
    body:
      'Vademde adı, logosu, tasarımı, yazılımı ve uygulama içeriği (kullanıcı tarafından ' +
      'yüklenen belgeler hariç) Turgut Akın Kaya’ya (DoTa Medya) aittir ve telif hakkı ile ' +
      'korunur. Hizmeti yalnızca kişisel veya işletmenizin meşru ihtiyaçları için, bu Koşullara ' +
      'uygun şekilde kullanabilirsiniz. Yüklediğiniz belgeler ve girdiğiniz finansal veriler ' +
      'size aittir; bunları dilediğiniz zaman silebilirsiniz (bkz. Gizlilik Politikası). ' +
      'Hizmeti size sunabilmemiz için gerekli ölçüde (işleme, depolama, OCR analizi) bu ' +
      'verileri kullanmamıza izin verirsiniz.',
  },
  {
    title: '10. Hizmetin Değiştirilmesi ve Kesintiler',
    body:
      'Hizmeti geliştirmek, güvenliğini sağlamak veya yasal gerekliliklere uymak amacıyla ' +
      'özelliklerde değişiklik yapabilir, bazı özellikleri askıya alabilir veya sonlandırabiliriz. ' +
      'Planlı bakım dışındaki kesintiler için makul ölçüde önceden bilgilendirme yapmaya ' +
      'çalışırız.',
  },
  {
    title: '11. Sorumluluğun Sınırlandırılması',
    body:
      'Hizmet "olduğu gibi" sunulur. Yürürlükteki mevzuatın izin verdiği azami ölçüde; OCR ' +
      'sonuçlarının hatalı olmasından, hizmetin kesintiye uğramasından, veri kaybından veya ' +
      'kullanıcı tarafından onaylanan verilere dayanarak alınan finansal kararlardan doğan ' +
      'dolaylı, arızi veya sonuç niteliğindeki zararlardan sorumlu değiliz. Bu sınırlama, ' +
      'kastın veya ağır kusurun kanunen sorumluluk doğurduğu hâllerde uygulanmaz.',
  },
  {
    title: '12. Hesap Feshi',
    body:
      'Hesabınızı istediğiniz zaman uygulama içinden (Profil > Hesabımı ve Verilerimi Sil) ' +
      'doğrudan silebilirsiniz. Bu Koşulları ihlal etmeniz hâlinde hesabınızı askıya alma veya ' +
      'sonlandırma hakkımız saklıdır; bu durumda sizi bilgilendiririz.',
  },
  {
    title: '13. Uygulanacak Hukuk ve Yetki',
    body:
      'Bu Koşullar Türkiye Cumhuriyeti kanunlarına tabidir. Bu Koşullardan doğabilecek ' +
      'uyuşmazlıklarda İzmir mahkemeleri ve icra daireleri ile tüketici işlemlerinde ilgili ' +
      'tüketici hakem heyetleri ve tüketici mahkemeleri yetkilidir.',
  },
  {
    title: '14. Değişiklikler',
    body:
      'Bu Koşulları zaman zaman güncelleyebiliriz. Önemli değişiklikleri uygulama içi bildirim ' +
      've e-posta yoluyla duyururuz. Güncel sürüm her zaman uygulama içinde ve ' +
      'www.vademde.com/kullanim-sartlari adresinde yayınlanır.',
  },
  {
    title: '15. İletişim',
    body: 'Sorularınız için: info@vademde.com veya 0543 203 53 09.',
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
