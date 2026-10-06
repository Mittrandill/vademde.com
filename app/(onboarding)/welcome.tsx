import { useRef, useState } from 'react';
import { Dimensions, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';

import { useTheme } from '@/theme';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingPage {
  Scene: (props: IntroSceneProps) => React.JSX.Element;
  title: string;
  body: string;
}

// Tuval Tanisma1–3 + Hosgeldin: üç değer önerisi sayfası ve ardından hesap seçimi (Apple / e-posta / giriş).
// docs/03-bilgi-mimarisi-ekranlar.md §5.2 — yalnızca ilk açılışta ve oturum yokken gösterilir. Deneme/fiyat
// teklifi kayıttan sonra açılan paywall'dadır (app/paywall/index.tsx).
const PAGES: OnboardingPage[] = [
  {
    Scene: ScanIntroScene,
    title: 'Belgeyi çekin,\ngerisini Vademde yapsın',
    body: 'Çek, senet, fatura, ekstre ya da kredi ödeme planı. Tutar, tarih ve taraflar saniyeler içinde forma dökülür.',
  },
  {
    Scene: ConfirmIntroScene,
    title: 'Her kaydı\nsiz onaylarsınız',
    body: 'Okunan bilgiler önce size gösterilir. Emin olmadığımız alanları işaretleriz; onayınız olmadan hiçbir kayıt oluşmaz.',
  },
  {
    Scene: DueIntroScene,
    title: 'Hiçbir vade\nsessizce geçmez',
    body: 'Çek, senet, taksit ve faturalar tek takvimde. Ne zaman hatırlatacağımızı siz seçersiniz.',
  },
];

const PAGE_COUNT = PAGES.length + 1;

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

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}>
        {page > 0 ? (
          <Pressable accessibilityLabel="Geri" onPress={() => goTo(page - 1)} hitSlop={8} style={{ width: 44, height: 44, justifyContent: 'center', paddingLeft: 8 }}>
            <Ionicons name="chevron-back" size={26} color={theme.colors.textPrimary} />
          </Pressable>
        ) : (
          <View />
        )}
        {!isAccountPage ? (
          <Pressable accessibilityRole="button" onPress={() => goTo(PAGES.length)} hitSlop={8} style={{ paddingHorizontal: 8, height: 44, justifyContent: 'center' }}>
            <Text color="textSecondary" style={{ fontWeight: '500' }}>
              Atla
            </Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={{ flex: 1 }}
      >
        {PAGES.map(({ Scene, title, body }, index) => (
          <ScrollView
            key={title}
            style={{ width: SCREEN_WIDTH }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingBottom: 8 }}
          >
            <Scene active={page === index} />
            <View style={{ paddingHorizontal: 4, marginTop: 32 }}>
              <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.56 }}>{title}</Text>
              <Text color="textSecondary" style={{ marginTop: 12 }}>
                {body}
              </Text>
            </View>
          </ScrollView>
        ))}

        {/* Hosgeldin: hesapla devam et. */}
        <View style={{ width: SCREEN_WIDTH, paddingHorizontal: theme.screenEdge.standard }}>
          <View style={{ alignItems: 'center', marginTop: 56 }}>
            <VademdeMark size={88} />
            <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.56, textAlign: 'center', marginTop: 24 }}>
              {'Hesabınızla\ndevam edin'}
            </Text>
            <Text color="textSecondary" style={{ fontSize: 15, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 280 }}>
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
        <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingBottom: 20, paddingTop: 8, gap: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            {Array.from({ length: PAGE_COUNT - 1 }, (_, index) => (
              <View
                key={index}
                style={{
                  width: index === page ? 20 : 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: index === page ? theme.colors.textPrimary : theme.colors.border,
                }}
              />
            ))}
          </View>
          <Button label={page === PAGES.length - 1 ? 'Başlayalım' : 'Devam'} onPress={() => goTo(page + 1)} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
