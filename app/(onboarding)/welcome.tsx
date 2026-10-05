import { useRef, useState } from 'react';
import { Dimensions, ScrollView, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, Pressable, Row, Stack, Text } from '@/components/primitives';
import {
  NotificationsIntroScene,
  ScanIntroScene,
  TimelineIntroScene,
  WorkspacesIntroScene,
  type IntroSceneProps,
} from '@/components/onboarding/introScenes';
import { useOnboardingStore } from '@/store/onboardingStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingPage {
  Scene: (props: IntroSceneProps) => React.JSX.Element;
  eyebrow: string;
  title: string;
  body: string;
}

// docs/03-bilgi-mimarisi-ekranlar.md §5.2 — kısa değer önerisi ekranları yalnızca ilk açılışta
// gösterilir (yeniden tasarım: dört adım). OCR ürünün ana kayıt yöntemidir (docs/00); akış taramayla
// açılır, vade hattı, bildirimler ve çalışma alanlarıyla sürer. Deneme/fiyat teklifi kayıttan sonra
// açılan paywall'da (app/paywall/index.tsx) sunulur.
const PAGES: OnboardingPage[] = [
  {
    Scene: ScanIntroScene,
    eyebrow: 'Belge Tara',
    title: 'Fotoğrafını çek, yazmayı unut.',
    body: 'Çek, senet ya da fatura. Vademde tutarı, vadeyi ve karşı tarafı okur; sen yalnızca onaylarsın.',
  },
  {
    Scene: TimelineIntroScene,
    eyebrow: 'Vade hattı',
    title: 'Bütün vadeler tek bir hatta.',
    body: 'Ödeyeceklerin üstte, tahsil edeceklerin altta. Önümüzdeki haftayı tek bakışta gör.',
  },
  {
    Scene: NotificationsIntroScene,
    eyebrow: 'Bildirimler',
    title: 'Gecikmeden önce haber verir.',
    body: 'Vade yaklaştığında, bakiye yetmeyeceğinde ve çek tahsil günü geldiğinde zamanında bildirim.',
  },
  {
    Scene: WorkspacesIntroScene,
    eyebrow: 'Çalışma alanları',
    title: 'Kişisel bütçe ya da bütün ekip.',
    body: 'Ev bütçeni ve işini ayrı çalışma alanlarında yönet, ekibini rol vererek davet et.',
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
              <Text variant="label" color="textSecondary" tabular accessibilityLabel={`${eyebrow}, ${index + 1}. adım, toplam ${PAGES.length}`}>
                {String(index + 1).padStart(2, '0')} / {String(PAGES.length).padStart(2, '0')}
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
                backgroundColor: index === page ? theme.colors.textPrimary : theme.colors.border,
              }}
            />
          ))}
        </Row>
        <Button label={isLastPage ? 'Başla' : 'İleri'} onPress={goNext} />
        <Pressable
          accessibilityRole="button"
          onPress={finish}
          style={{ minHeight: theme.touchTarget.minimum, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text variant="cardTitle" style={{ fontSize: 14 }}>
            {isLastPage ? 'Hesabım var' : 'Hesabım var, giriş yap'}
          </Text>
        </Pressable>
      </Stack>
    </SafeAreaView>
  );
}
