import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';

export interface OnboardingWorkspaceIllustrationProps {
  size?: number;
}

// Onboarding 3/3 — "Borcun da Alacağın da Tek Yerde": kişisel ve işletme çalışma
// alanlarının üst üste duran ayrı yüzeyler olarak, aralarında net bir bakiye trendiyle
// izole edildiğini anlatır (bağlayıcı kural #3 — workspace izolasyonu). Violet vurgu,
// docs/08-tasarim-sistemi.md §12.2'de "Analiz ve bütçe" rolüne karşılık gelir.
export function OnboardingWorkspaceIllustration({ size = 200 }: OnboardingWorkspaceIllustrationProps) {
  const theme = useTheme();
  const paper = theme.colors.surfaceElevated;
  const backPaper = theme.colors.surfacePrimary;
  const stroke = theme.colors.border;
  const lineColor = withAlpha(theme.colors.textSecondary, 0.35);
  const accent = theme.colors.accentViolet;
  const accentSoft = withAlpha(theme.colors.accentViolet, 0.2);

  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      {/* Arka çalışma alanı — ör. işletme. */}
      <Rect x="14" y="18" width="52" height="34" rx="14" fill={backPaper} stroke={stroke} strokeWidth={1.5} transform="rotate(-6 40 35)" />
      <Circle cx="24" cy="28" r="3" fill={lineColor} transform="rotate(-6 40 35)" />
      <Line x1="32" y1="28" x2="52" y2="28" stroke={lineColor} strokeWidth={2.5} strokeLinecap="round" transform="rotate(-6 40 35)" />

      {/* Ön çalışma alanı — ör. kişisel; bakiye trendiyle öne çıkar. */}
      <Rect x="20" y="42" width="60" height="40" rx="16" fill={paper} stroke={stroke} strokeWidth={1.5} />
      <Circle cx="32" cy="54" r="4" fill={accentSoft} />
      <Circle cx="32" cy="54" r="2" fill={accent} />
      <Line x1="42" y1="54" x2="64" y2="54" stroke={lineColor} strokeWidth={2.5} strokeLinecap="round" />

      {/* Mini bakiye çubukları. */}
      <Rect x="30" y="68" width="6" height="8" rx="2" fill={lineColor} />
      <Rect x="40" y="64" width="6" height="12" rx="2" fill={lineColor} />
      <Rect x="50" y="60" width="6" height="16" rx="2" fill={accent} />
      <Rect x="60" y="66" width="6" height="10" rx="2" fill={lineColor} />

      <Line x1="30" y1="59" x2="66" y2="52" stroke={accent} strokeWidth={2} strokeLinecap="round" />
      <Circle cx="66" cy="52" r="3" fill={accent} />
    </Svg>
  );
}
