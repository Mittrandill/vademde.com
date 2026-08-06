import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';

export interface OnboardingReminderIllustrationProps {
  size?: number;
}

// Onboarding 2/3 — "Vadelerini Kaçırma": takvim üzerinde vurgulanan bir vade günü ve
// hatırlatma zilini anlatır (docs/08-tasarim-sistemi.md §12.3 — "özgün onboarding
// illüstrasyonları", §12.9 — monokrom + 1-2 vurgu rengi).
export function OnboardingReminderIllustration({ size = 200 }: OnboardingReminderIllustrationProps) {
  const theme = useTheme();
  const paper = theme.colors.surfaceElevated;
  const stroke = theme.colors.border;
  const lineColor = withAlpha(theme.colors.textSecondary, 0.35);
  const accent = theme.colors.brandPrimary;
  const accentSoft = withAlpha(theme.colors.brandPrimary, 0.22);

  const days = [
    { x: 28, y: 40 }, { x: 40, y: 40 }, { x: 52, y: 40 },
    { x: 28, y: 51 }, { x: 40, y: 51 }, { x: 52, y: 51 },
    { x: 28, y: 62 }, { x: 40, y: 62 },
  ];

  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      {/* Takvim gövdesi. */}
      <Rect x="16" y="24" width="52" height="52" rx="10" fill={paper} stroke={stroke} strokeWidth={1.5} />
      <Rect x="16" y="24" width="52" height="15" rx="10" fill={accentSoft} />
      <Line x1="28" y1="18" x2="28" y2="28" stroke={accent} strokeWidth={3} strokeLinecap="round" />
      <Line x1="56" y1="18" x2="56" y2="28" stroke={accent} strokeWidth={3} strokeLinecap="round" />

      {days.map((d, i) => (
        <Rect
          key={i}
          x={d.x}
          y={d.y}
          width="8"
          height="8"
          rx="2.5"
          fill={i === 7 ? accent : lineColor}
        />
      ))}

      {/* Hatırlatma zili — takvimin üstünde, çınlama işaretleriyle. */}
      <Circle cx="72" cy="70" r="16" fill={paper} stroke={stroke} strokeWidth={1.5} />
      <Path
        d="M72 61c-3.3 0-6 2.7-6 6v3.5l-2 3.5h16l-2-3.5V67c0-3.3-2.7-6-6-6z"
        fill={accent}
      />
      <Path d="M69.5 76.5a2.5 2.5 0 0 0 5 0" stroke={paper} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <Path d="M83 63c1.5 1.8 1.5 5 0 6.8" stroke={lineColor} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Path d="M87 60c2.6 3.2 2.6 8.6 0 11.8" stroke={lineColor} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
