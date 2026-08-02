import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';

export interface DocumentCalendarIllustrationProps {
  size?: number;
}

// Belge takibi + vade temasını anlatan, elle çizilmiş geometrik bir illüstrasyon —
// hazır stok paketi değil, monokrom yüzeyler + tek vurgu rengi (docs/08-tasarim-sistemi.md
// §12.3 "özgün onboarding illüstrasyonları", §12.9 "monokrom karakter, 1-2 vurgu rengi").
export function DocumentCalendarIllustration({ size = 84 }: DocumentCalendarIllustrationProps) {
  const theme = useTheme();
  const paper = theme.colors.surfaceElevated;
  const stroke = theme.colors.border;
  const lineColor = withAlpha(theme.colors.textSecondary, 0.35);
  const accent = theme.colors.brandPrimary;
  const accentSoft = withAlpha(theme.colors.brandPrimary, 0.22);

  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      {/* Arka belge — hafif dönük, satır çizgileriyle bir kayıt/OCR sonucu ima eder. */}
      <Rect
        x="14"
        y="18"
        width="46"
        height="60"
        rx="8"
        fill={paper}
        stroke={stroke}
        strokeWidth={1.5}
        transform="rotate(-8 37 48)"
      />
      <Line x1="24" y1="34" x2="50" y2="34" stroke={lineColor} strokeWidth={3} strokeLinecap="round" transform="rotate(-8 37 48)" />
      <Line x1="24" y1="44" x2="50" y2="44" stroke={lineColor} strokeWidth={3} strokeLinecap="round" transform="rotate(-8 37 48)" />
      <Line x1="24" y1="54" x2="42" y2="54" stroke={lineColor} strokeWidth={3} strokeLinecap="round" transform="rotate(-8 37 48)" />

      {/* Ön takvim kartı — vadeyi temsil eder. */}
      <Rect x="38" y="30" width="46" height="46" rx="10" fill={paper} stroke={stroke} strokeWidth={1.5} />
      <Rect x="38" y="30" width="46" height="14" rx="10" fill={accentSoft} />
      <Line x1="50" y1="26" x2="50" y2="34" stroke={accent} strokeWidth={3} strokeLinecap="round" />
      <Line x1="72" y1="26" x2="72" y2="34" stroke={accent} strokeWidth={3} strokeLinecap="round" />
      <Circle cx="48" cy="54" r="2" fill={lineColor} />
      <Circle cx="58" cy="54" r="2" fill={lineColor} />
      <Circle cx="68" cy="54" r="2" fill={lineColor} />
      <Circle cx="48" cy="64" r="2" fill={lineColor} />
      <Circle cx="58" cy="64" r="2" fill={accent} />
      <Circle cx="68" cy="64" r="2" fill={lineColor} />

      {/* Onay rozeti — takip edilen kaydın kontrol altında olduğunu vurgular. */}
      <Circle cx="78" cy="70" r="13" fill={accent} stroke={paper} strokeWidth={3} />
      <Path
        d="M72 70 L76 74 L84 65"
        stroke={theme.colors.brandPrimaryText}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
