import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { useThemePreferenceStore } from '@/store/themePreferenceStore';
import { colorsByScheme, type ColorScheme, type ThemeColors } from './colors';
import { motion } from './motion';
import { buttonHeight, radius, screenEdge, spacing, touchTarget } from './spacing';
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
  motion: typeof motion;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const themePreference = useThemePreferenceStore((s) => s.themePreference);
  const scheme: ColorScheme =
    themePreference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : themePreference;

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
      motion,
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
