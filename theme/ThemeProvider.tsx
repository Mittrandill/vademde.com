import { createContext, useContext, useEffect, useMemo, type PropsWithChildren } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { useThemePreferenceStore } from '@/store/themePreferenceStore';
import { colorsByScheme, type ColorScheme, type ThemeColors } from './colors';
import { iconSize, opacity } from './interaction';
import { motion } from './motion';
import {
  buttonHeight,
  controlHeight,
  layout,
  radius,
  screenEdge,
  spacing,
  touchTarget,
} from './spacing';
import { tabularNums, typography } from './typography';

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  typography: typeof typography;
  tabularNums: typeof tabularNums;
  spacing: typeof spacing;
  screenEdge: typeof screenEdge;
  radius: typeof radius;
  touchTarget: typeof touchTarget;
  buttonHeight: typeof buttonHeight;
  controlHeight: typeof controlHeight;
  motion: typeof motion;
  opacity: typeof opacity;
  iconSize: typeof iconSize;
  layout: typeof layout;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const themePreference = useThemePreferenceStore((s) => s.themePreference);
  const scheme: ColorScheme =
    themePreference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : themePreference;

  // Yerel (native) bileşenler de (Alert, klavye, action sheet) uygulamanın kendi temasıyla
  // aynı görünümde kalsın diye burada senkronize edilir — yoksa örn. Ayarlar'dan "Koyu"
  // seçildiğinde uygulamanın kendi ekranları koyu kalır ama native bir uyarı kutusu sistem
  // ayarını (açık) takip edip tutarsız görünebilirdi. 'Sistem' seçiliyken override kaldırılır.
  useEffect(() => {
    Appearance.setColorScheme(themePreference === 'system' ? 'unspecified' : themePreference);
  }, [themePreference]);

  const theme = useMemo<Theme>(
    () => ({
      scheme,
      colors: colorsByScheme[scheme],
      typography,
      tabularNums,
      spacing,
      screenEdge,
      radius,
      touchTarget,
      buttonHeight,
      controlHeight,
      motion,
      opacity,
      iconSize,
      layout,
    }),
    [scheme]
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme, ThemeProvider içinde kullanılmalıdır');
  }
  return theme;
}
