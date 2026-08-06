import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';

import { useTheme } from '@/theme';
import { AuthHeader } from './AuthHeader';

const TRACK_WIDTH = 120;
const SEGMENT_WIDTH = 44;

// Oturum kontrolü sürerken app/_layout.tsx'in `isLoading` dalında boş ekran yerine
// gösterilir, böylece native splash (app.json) ile uygulama hazır olduğu an arasında
// marka boşluğu kalmaz. Native splash ile aynı temaya (açık/koyu) uyar ki geçiş sırasında
// renk sıçraması olmasın.
export function Splash() {
  const theme = useTheme();
  // useRef(...).current yerine useState ile tek seferlik lazy init — react-hooks/refs
  // kuralı "render sırasında ref okuma" olarak yanlış pozitif verdiği için tercih edildi.
  const [opacity] = useState(() => new Animated.Value(0));
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [opacity, progress]);

  // tara.tsx ile aynı desen — Animated.Value'nun ham `.current` referansı yerine her
  // zaman bir interpolate() çıktısı JSX'e verilir (bkz. react-hooks/refs kural notu).
  const containerOpacity = opacity.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const segmentTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-SEGMENT_WIDTH, TRACK_WIDTH],
  });

  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor: theme.colors.backgroundPrimary,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: containerOpacity,
      }}
    >
      <AuthHeader markSize={72} />

      <Animated.View
        style={{
          position: 'absolute',
          bottom: 96,
          width: TRACK_WIDTH,
          height: 4,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.border,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            width: SEGMENT_WIDTH,
            height: 4,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.accentViolet,
            transform: [{ translateX: segmentTranslateX }],
          }}
        />
      </Animated.View>
    </Animated.View>
  );
}
