import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';

export interface OnboardingScanIllustrationProps {
  size?: number;
}

// Onboarding 1/3 — "Belgeni Tara": telefonla çekilen bir belgenin (çek) canlı kenar
// algılamayla karta dönüşmesini anlatır (docs/08-tasarim-sistemi.md §12.3/§12.12).
// Monokrom yüzeyler + tek Saffron vurgu (viewfinder köşeleri) — hazır stok değil.
export function OnboardingScanIllustration({ size = 200 }: OnboardingScanIllustrationProps) {
  const theme = useTheme();
  const paper = theme.colors.surfaceElevated;
  const stroke = theme.colors.border;
  const lineColor = withAlpha(theme.colors.textSecondary, 0.35);
  const motionColor = withAlpha(theme.colors.textSecondary, 0.18);
  const accent = theme.colors.brandPrimary;

  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      {/* Arkadaki hareket çizgileri — kamera açılışını ima eder. */}
      <Line x1="10" y1="24" x2="20" y2="20" stroke={motionColor} strokeWidth={2.5} strokeLinecap="round" />
      <Line x1="8" y1="34" x2="19" y2="32" stroke={motionColor} strokeWidth={2.5} strokeLinecap="round" />
      <Line x1="10" y1="44" x2="20" y2="44" stroke={motionColor} strokeWidth={2.5} strokeLinecap="round" />

      {/* Telefon gövdesi — hafif eğik. */}
      <Rect
        x="30"
        y="14"
        width="40"
        height="72"
        rx="9"
        fill={paper}
        stroke={stroke}
        strokeWidth={1.5}
        transform="rotate(-5 50 50)"
      />
      <Circle cx="50" cy="20" r="1.6" fill={lineColor} transform="rotate(-5 50 50)" />

      {/* Ekrandaki belge (çek) önizlemesi. */}
      <Rect x="36" y="30" width="28" height="40" rx="4" fill={theme.colors.surfacePrimary} stroke={stroke} strokeWidth={1} transform="rotate(-5 50 50)" />
      <Line x1="40" y1="38" x2="58" y2="38" stroke={lineColor} strokeWidth={2} strokeLinecap="round" transform="rotate(-5 50 50)" />
      <Line x1="40" y1="45" x2="54" y2="45" stroke={lineColor} strokeWidth={2} strokeLinecap="round" transform="rotate(-5 50 50)" />
      <Line x1="40" y1="52" x2="58" y2="52" stroke={accent} strokeWidth={2.5} strokeLinecap="round" transform="rotate(-5 50 50)" />
      <Line x1="40" y1="59" x2="50" y2="59" stroke={lineColor} strokeWidth={2} strokeLinecap="round" transform="rotate(-5 50 50)" />

      {/* Canlı kenar algılama — Saffron viewfinder köşeleri. */}
      <Path d="M22 26 L22 18 Q22 14 26 14 L34 14" stroke={accent} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M74 14 L82 14 Q86 14 86 18 L86 26" stroke={accent} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M86 74 L86 82 Q86 86 82 86 L74 86" stroke={accent} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M34 86 L26 86 Q22 86 22 82 L22 74" stroke={accent} strokeWidth={3} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
