import { useRef, useState } from 'react';
import { Dimensions, ScrollView, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, Pressable, Row, Stack, Text } from '@/components/primitives';
import {
  ReviewScene,
  ScanHeroScene,
  ScanningScene,
  TeamScene,
  TrialScene,
  type SceneProps,
} from '@/components/onboarding/scenes';
import { useOnboardingStore } from '@/store/onboardingStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingPage {
  Scene: (props: SceneProps) => React.JSX.Element;
  eyebrow: string;
  title: string;
  body: string;
}

// docs/03-bilgi-mimarisi-ekranlar.md §5.2 — kısa değer önerisi ekranları yalnızca ilk açılışta
// gösterilir. OCR ürünün ana kayıt yöntemidir (docs/00), bu yüzden akış taramayla açılır:
// tara → okunur → sen onaylarsın; ardından çalışma alanı/ekip ve 7 gün ücretsiz deneme.
// Son sahne yalnızca teklifi anlatır: satın alma oturum gerektirdiği için fiyatlar ve satın
// alma, kayıttan sonra açılan paywall'da (app/paywall/index.tsx) RevenueCat fiyatlarıyla sunulur.
const PAGES: OnboardingPage[] = [
  {
    Scene: ScanHeroScene,
    eyebrow: 'Belge Tara',
    title: 'Fotoğrafını çek, yazmayı unut.',
    body: 'Çek, senet veya fatura. Tek dokunuşla kamera açılır, gerisini Vademde okur.',
  },
  {
    Scene: ScanningScene,
    eyebrow: 'Akıllı okuma',
    title: 'Saniyeler içinde okunur.',
    body: 'Tutar, vade ve karşı taraf kendiliğinden ayrıştırılır. Elle yazmak yok.',
  },
  {
    Scene: ReviewScene,
    eyebrow: 'Senin onayınla',
    title: 'Okunan her şey önüne gelir.',
    body: 'Alanları sen görür, gerekirse düzeltir, onaylarsın. Okuma tutmazsa manuel giriş hep açık.',
  },
  {
    Scene: TeamScene,
    eyebrow: 'Çalışma alanları ve ekip',
    title: 'Kişisel ve iş, ayrı ayrı.',
    body: 'Her çalışma alanının verisi tamamen ayrıdır. Ekibini davet et, kimin düzenleyeceğini sen seç.',
  },
  {
    Scene: TrialScene,
    eyebrow: 'Vademde Plus',
    title: 'İlk 7 gün bizden.',
    body: 'Tüm Plus özellikleri açık. Deneme süresince ücret alınmaz.',
  },
];

export default function WelcomeScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const scrollRef = useRef<ScrollView>(null);
  const setHasSeenWelcome = useOnboardingStore((s) => s.setHasSeenWelcome);
  const [page, setPage] = useState(0);
  const isLastPage = page === PAGES.length - 1;

  function finish() {
    setHasSeenWelcome(true);
    router.push('/(auth)/sign-in');
  }

  function goNext() {
    if (isLastPage) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({ x: (page + 1) * SCREEN_WIDTH, animated: true });
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextPage = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (nextPage !== page) setPage(nextPage);
  }

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Row style={{ justifyContent: 'flex-end', paddingHorizontal: theme.screenEdge.standard, height: theme.touchTarget.minimum }}>
        {!isLastPage ? (
          <Pressable accessibilityRole="button" onPress={finish} hitSlop={8}>
            <Text variant="body" color="textSecondary">
              Atla
            </Text>
          </Pressable>
        ) : null}
      </Row>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={{ flex: 1 }}
      >
        {PAGES.map(({ Scene, eyebrow, title, body }, index) => (
          // Sahne + metin küçük ekranlara ya da büyük yazı tipine sığmazsa dikey kaydırılır;
          // yer varsa içerik dikeyde ortalanır. Alttaki buton her koşulda erişilebilir kalır.
          <ScrollView
            key={title}
            style={{ width: SCREEN_WIDTH }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              gap: theme.spacing.lg,
              paddingHorizontal: theme.screenEdge.standard,
              paddingVertical: theme.spacing.sm,
            }}
          >
            <Scene active={page === index} />
            <Stack gap="xs">
              <Text variant="caption" style={{ color: theme.colors.brandPrimary, fontWeight: '700', letterSpacing: 1.2 }}>
                {eyebrow.toLocaleUpperCase('tr-TR')}
              </Text>
              <Text variant="pageTitle">{title}</Text>
              <Text variant="body" color="textSecondary">
                {body}
              </Text>
            </Stack>
          </ScrollView>
        ))}
      </ScrollView>

      <Stack
        gap="sm"
        style={{
          paddingHorizontal: theme.screenEdge.standard,
          paddingBottom: theme.spacing.md,
          paddingTop: theme.spacing.sm,
        }}
      >
        <Row gap="xs" style={{ justifyContent: 'center' }}>
          {PAGES.map((_, index) => (
            <Stack
              key={index}
              style={{
                width: index === page ? 22 : 6,
                height: 6,
                borderRadius: theme.radius.pill,
                backgroundColor: index === page ? theme.colors.brandPrimary : theme.colors.border,
              }}
            />
          ))}
        </Row>
        <Button label={isLastPage ? 'Başla' : 'Devam'} onPress={goNext} />
        {isLastPage ? (
          <Text variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>
            Deneme teklifi hesabını oluşturduktan sonra sunulur.
          </Text>
        ) : null}
      </Stack>
    </SafeAreaView>
  );
}
