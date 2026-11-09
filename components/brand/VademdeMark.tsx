import Svg, { Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';

export interface VademdeMarkProps {
  size?: number;
  /** Verilirse tema yerine sabit bir renk şeması kullanılır (ör. Splash her zaman koyu zeminde çalışır). */
  markColor?: string;
}

// Vademde_Tam_Logo_Paketi_v2.0/02_Sembol — marka sembolünün react-native-svg karşılığı.
// "V" formu vade okunu, üstteki Saffron çubuklar yükselen geliri/tahsilatı, alttaki
// Violet çubuklar analiz/bütçe katmanını temsil eder (bkz. design-tokens.json).
// Çubuk renkleri marka kimliğine kilitlidir ve şemadan bağımsız sabit kalır; yalnızca
// ana "V" rengi zemine göre (koyu/açık tema) tema token'ından türetilir.
export function VademdeMark({ size = 96, markColor }: VademdeMarkProps) {
  const theme = useTheme();
  const height = size * (980 / 1024);
  const arrowColor = markColor ?? theme.colors.textPrimary;

  return (
    <Svg width={size} height={height} viewBox="0 0 1024 980" fill="none">
      <Path
        fill={arrowColor}
        d="M221.2,330.7l203.6,311.2c17.7,27.1,48,43.5,80.4,43.5h15.4c32.5,0,62.8-16.5,80.6-43.8l201.7-310.9h-80.7c-17.7,0-34.3,8.9-44.1,23.6l-159.8,240.2c-.8,1.2-2.1,1.9-3.6,1.9h-6c-1.4,0-2.8-.7-3.6-1.9l-156.3-237.6c-10.7-16.3-29-26.2-48.6-26.2h-79.1Z"
      />
      <Rect fill={theme.colors.accentViolet} x="490.3" y="725.1" width="43.4" height="164" rx="21.7" ry="21.7" />
      <Rect fill={theme.colors.accentViolet} x="575.2" y="704.8" width="43.4" height="124.3" rx="21.7" ry="21.7" />
      <Rect fill={theme.colors.accentViolet} x="405.3" y="695.3" width="43.4" height="140.9" rx="21.7" ry="21.7" />
      <Rect fill={theme.colors.brandPrimary} x="404.7" y="231.9" width="43.4" height="185" rx="21.7" ry="21.7" />
      <Rect fill={theme.colors.brandPrimary} x="489.6" y="174.5" width="43.4" height="277.7" rx="21.7" ry="21.7" />
      <Path
        fill={theme.colors.brandPrimary}
        d="M617.4,341l-24.2,37.1c-2.2,3.3-5.9,5.3-9.8,5.3h-3c-3.2,0-5.8-2.6-5.8-5.8V112.8c0-12,9.8-21.8,21.8-21.8h0c12,0,21.7,9.7,21.8,21.7l1.2,221.9c0,2.3-.7,4.6-1.9,6.5Z"
      />
    </Svg>
  );
}
