import { useRef, useState } from 'react';
import { Dimensions, ScrollView, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Pressable, Row, Stack, Text } from '@/components/primitives';
import { OnboardingScanIllustration } from '@/components/brand/OnboardingScanIllustration';
import { OnboardingReminderIllustration } from '@/components/brand/OnboardingReminderIllustration';
import { OnboardingWorkspaceIllustration } from '@/components/brand/OnboardingWorkspaceIllustration';
import { useOnboardingStore } from '@/store/onboardingStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// docs/03-bilgi-mimarisi-ekranlar.md §5.2 — "Üç kısa değer önerisi ekranı". Her sayfa
// tek bir özgün illüstrasyon + kısa mesajla tek bir yeteneği anlatır (docs/08 §12.3).
const PAGES = [
  {
    Illustration: OnboardingScanIllustration,
    title: 'Belgeni Tara',
    body: 'Çek, senet, fatura ve kredi ödeme planlarını otomatik okuruz.',
  },
  {
    Illustration: OnboardingReminderIllustration,
    title: 'Vadelerini Kaçırma',
    body: 'Yaklaşan ödemeleri hatırlatalım, gecikmeleri önleyelim.',
  },
  {
    Illustration: OnboardingWorkspaceIllustration,
    title: 'Borcun da Alacağın da Tek Yerde',
    body: 'Kişisel ve işletme hesaplarını ayrı çalışma alanlarında, net bir bakiyeyle takip et.',
  },
];

export default function WelcomeScreen() {
  const theme = useTheme();
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Row style={{ justifyContent: 'flex-end', paddingHorizontal: theme.screenEdge.standard, height: theme.touchTarget.minimum }}>
        {!isLastPage ? (
          <Pressable onPress={finish} hitSlop={8}>
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
        {PAGES.map(({ Illustration, title, body }, index) => (
          <Stack
            key={index}
            align="center"
            gap="xl"
            style={{ width: SCREEN_WIDTH, paddingHorizontal: theme.screenEdge.standard, justifyContent: 'center' }}
          >
            <Illustration size={200} />
            <Stack gap="xs" align="center">
              <Text variant="pageTitle" style={{ textAlign: 'center' }}>
                {title}
              </Text>
              <Text variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
                {body}
              </Text>
            </Stack>
          </Stack>
        ))}
      </ScrollView>

      <Row
        style={{
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: theme.screenEdge.standard,
          paddingBottom: theme.spacing.lg,
          paddingTop: theme.spacing.md,
        }}
      >
        <Row gap="xs">
          {PAGES.map((_, index) => (
            <Stack
              key={index}
              style={{
                width: index === page ? 20 : 8,
                height: 8,
                borderRadius: theme.radius.pill,
                backgroundColor: index === page ? theme.colors.brandPrimary : theme.colors.border,
              }}
            />
          ))}
        </Row>

        <Pressable
          onPress={goNext}
          accessibilityRole="button"
          accessibilityLabel={isLastPage ? 'Başla' : 'Sonraki'}
          style={{
            width: theme.buttonHeight.primary,
            height: theme.buttonHeight.primary,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.surfaceElevated,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="arrow-forward" size={theme.iconSize.xl} color={theme.colors.textPrimary} />
        </Pressable>
      </Row>
    </SafeAreaView>
  );
}
