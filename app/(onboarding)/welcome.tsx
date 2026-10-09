import { useRef, useState } from 'react';
import { Dimensions, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';

import { useTheme, withAlpha } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, Pressable, Text } from '@/components/primitives';
import {
  ConfirmIntroScene,
  DueIntroScene,
  ScanIntroScene,
  type IntroSceneProps,
} from '@/components/onboarding/introScenes';
import { VademdeMark } from '@/components/brand/VademdeMark';
import { SocialSignInButtons } from '@/components/auth/SocialSignInButtons';
import { signInWithApple, signInWithGoogle } from '@/features/auth/api';
import { translateAuthError } from '@/features/auth/errors';
import { useOnboardingStore } from '@/store/onboardingStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Sahne yüksekliği: küçük ekranlarda (SE) metin ve düğmeye yer kalsın diye ekran yüksekliğine bağlı.
const SCENE_HEIGHT = Math.round(Math.min(400, Math.max(300, SCREEN_HEIGHT * 0.44)));

interface OnboardingPage {
  Scene: (props: IntroSceneProps) => React.JSX.Element;
  eyebrow: string;
  /** Başlık; `accent` vurgulu yazılan kısımdır (App Store v3 setiyle aynı başlık dili). */
  title: { before?: string; accent: string; after?: string };
  body: string;
}

// Tanışma (3 değer önerisi) + Hoş geldin (hesap seçimi: Apple / Google / e-posta / giriş).
// docs/03-bilgi-mimarisi-ekranlar.md §5.2 — yalnızca ilk açılışta ve oturum yokken gösterilir. Deneme/fiyat
// teklifi kayıttan sonra açılan paywall'dadır (app/paywall/index.tsx).
const PAGES: OnboardingPage[] = [
  {
    Scene: ScanIntroScene,
    eyebrow: 'Akıllı belge okuma',
    title: { before: 'Fotoğrafını çekin,\n', accent: 'Vademde', after: ' okusun' },
    body: 'Çek, senet, fatura, dekont ya da kredi ödeme planı. Tutar, vade ve taraflar saniyeler içinde forma dökülür.',
  },
  {
    Scene: ConfirmIntroScene,
    eyebrow: 'Siz onaylarsınız',
    title: { before: 'Okunan her alan\nönce ', accent: 'size', after: ' gelir' },
    body: 'Emin olmadığımız alanları işaretleriz. Onayınız olmadan hiçbir kayıt oluşmaz.',
  },
  {
    Scene: DueIntroScene,
    eyebrow: 'Vade takvimi',
    title: { before: 'Hiçbir vade\n', accent: 'sessizce', after: ' geçmez' },
    body: 'Çek, senet, taksit ve faturalar tek takvimde. Ne zaman hatırlatacağımızı siz seçersiniz.',
  },
];

export default function WelcomeScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const scrollRef = useRef<ScrollView>(null);
  const setHasSeenWelcome = useOnboardingStore((s) => s.setHasSeenWelcome);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const isAccountPage = page === PAGES.length;

  function goTo(index: number) {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  }

  function finish(target: '/(auth)/sign-in' | '/(auth)/sign-up') {
    setHasSeenWelcome(true);
    router.push(target);
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextPage = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (nextPage !== page) setPage(nextPage);
  }

  async function handleApple() {
    setError(null);
    setAppleLoading(true);
    try {
      await signInWithApple();
      setHasSeenWelcome(true);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'ERR_REQUEST_CANCELED') setError(translateAuthError(err, 'Apple ile giriş yapılamadı'));
    } finally {
      setAppleLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      setHasSeenWelcome(true);
    } catch (err) {
      setError(translateAuthError(err, 'Google ile giriş yapılamadı'));
    } finally {
      setGoogleLoading(false);
    }
  }

  // Vurgu rengi: koyu temada Saffron; açık temada Saffron metin kontrastı yetersiz olduğu için koyu altın ton.
  const accentColor = theme.scheme === 'dark' ? theme.colors.brandPrimary : theme.colors.attentionMarker;

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8 }}>
        <View style={{ width: 60 }}>
          {page > 0 ? (
            <Pressable accessibilityLabel="Geri" onPress={() => goTo(page - 1)} hitSlop={8} style={{ width: 44, height: 44, justifyContent: 'center', paddingLeft: 8 }}>
              <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
            </Pressable>
          ) : null}
        </View>
        {/* Hikâye tarzı ilerleme: geçilen ve geçerli sayfa dolu */}
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Tanıtım, ${Math.min(page + 1, PAGES.length)} / ${PAGES.length}`}
          style={{ flex: 1, flexDirection: 'row', gap: 6, opacity: isAccountPage ? 0 : 1 }}
        >
          {PAGES.map((p, index) => (
            <View
              key={p.eyebrow}
              style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: index <= page ? theme.colors.brandPrimary : theme.colors.fill }}
            />
          ))}
        </View>
        <View style={{ width: 60, alignItems: 'flex-end' }}>
          {!isAccountPage ? (
            <Pressable accessibilityRole="button" onPress={() => goTo(PAGES.length)} hitSlop={8} style={{ paddingHorizontal: 8, height: 44, justifyContent: 'center' }}>
              <Text color="textSecondary" style={{ fontWeight: '500' }}>
                Atla
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={{ flex: 1 }}
      >
        {PAGES.map(({ Scene, eyebrow, title, body }, index) => (
          <ScrollView
            key={eyebrow}
            style={{ width: SCREEN_WIDTH }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 8 }}
          >
            <View style={{ marginTop: 8 }}>
              <Scene active={page === index} height={SCENE_HEIGHT} />
            </View>
            <View style={{ paddingHorizontal: theme.screenEdge.standard + 4, marginTop: 28 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accentColor }} />
                <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: accentColor }}>
                  {eyebrow}
                </Text>
              </View>
              <Text accessibilityRole="header" style={{ fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -0.9, marginTop: 12 }}>
                {title.before}
                <Text style={{ fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -0.9, color: accentColor }}>{title.accent}</Text>
                {title.after}
              </Text>
              <Text color="textSecondary" style={{ marginTop: 12, fontSize: 16, lineHeight: 22 }}>
                {body}
              </Text>
            </View>
          </ScrollView>
        ))}

        {/* Hoş geldin: hesapla devam et. */}
        <View style={{ width: SCREEN_WIDTH, paddingHorizontal: theme.screenEdge.standard }}>
          <View style={{ alignItems: 'center', marginTop: 88 }}>
            <View>
              <View
                style={{
                  width: 108,
                  height: 108,
                  borderRadius: 26,
                  backgroundColor: theme.colors.surfacePrimary,
                  borderWidth: 1,
                  borderColor: withAlpha(theme.colors.brandPrimary, 0.35),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <VademdeMark size={78} />
              </View>
            </View>
            <Text accessibilityRole="header" style={{ fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -0.9, textAlign: 'center', marginTop: 28 }}>
              {'Hesabınızla\n'}
              <Text style={{ fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -0.9, color: accentColor }}>devam edin</Text>
            </Text>
            <Text color="textSecondary" style={{ fontSize: 16, lineHeight: 22, textAlign: 'center', marginTop: 10, maxWidth: 300 }}>
              Kayıtlarınız ve belgeleriniz tüm cihazlarınızda güvenle eşitlenir.
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ gap: theme.spacing.xs, paddingBottom: theme.spacing.sm }}>
            <SocialSignInButtons
              onApplePress={handleApple}
              onGooglePress={handleGoogle}
              appleLoading={appleLoading}
              googleLoading={googleLoading}
            />
            <Button label="E-posta ile kayıt ol" variant="secondary" icon="mail" onPress={() => finish('/(auth)/sign-up')} />
            <Button label="Zaten hesabım var" variant="text" onPress={() => finish('/(auth)/sign-in')} />
            {error ? (
              <Text variant="caption" color="danger" style={{ textAlign: 'center' }}>
                {error}
              </Text>
            ) : null}
          </View>
          <Text variant="caption" color="textSecondary" style={{ textAlign: 'center', paddingBottom: theme.spacing.sm }}>
            Devam ederek{' '}
            <Link href="/legal/terms-of-service">
              <Text variant="caption" style={{ fontWeight: '600' }}>Kullanım Koşulları</Text>
            </Link>{' '}
            ve{' '}
            <Link href="/legal/privacy-policy">
              <Text variant="caption" style={{ fontWeight: '600' }}>Gizlilik Politikası</Text>
            </Link>
            ’nı kabul edersiniz.
          </Text>
        </View>
      </ScrollView>

      {!isAccountPage ? (
        <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingBottom: 16, paddingTop: 8 }}>
          <Button label={page === PAGES.length - 1 ? 'Başlayalım' : 'Devam'} onPress={() => goTo(page + 1)} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
