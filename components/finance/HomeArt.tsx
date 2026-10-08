import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { withAlpha } from '@/theme/colors';

// Ana sayfa kartlarının sağındaki dekoratif illüstrasyonlar. Renkler çağıran tarafından
// tema tokenlarından verilir; burada sabit renk yoktur (beyaz/siyah yalnızca ışık-gölge için alfa ile).
export function WalletArt({ accent, tone }: { accent: string; tone: string }) {
  return (
    <Svg width={150} height={134} viewBox="0 0 190 170">
      <G rotation={-16} origin="95, 85">
        <Rect x={34} y={30} width={150} height={96} rx={18} fill={withAlpha(tone, 0.06)} />
        <Rect x={34} y={30} width={150} height={26} rx={13} fill={accent} fillOpacity={0.9} />
        <Rect x={22} y={56} width={150} height={96} rx={18} fill={withAlpha(tone, 0.09)} />
        <Rect x={46} y={86} width={150} height={80} rx={18} fill={withAlpha(tone, 0.13)} />
      </G>
    </Svg>
  );
}

export function OverdueArt({ color }: { color: string }) {
  return (
    <Svg width={150} height={150} viewBox="0 0 150 150">
      <Circle cx={92} cy={96} r={44} fill={withAlpha(color, 0.16)} />
      <G rotation={12} origin="68, 70">
        <Rect x={32} y={16} width={72} height={96} rx={10} fill="#FFFFFF" fillOpacity={0.82} />
        {[34, 50, 66, 82].map((y) => (
          <Rect key={y} x={44} y={y} width={48} height={7} rx={3.5} fill={color} fillOpacity={0.4} />
        ))}
      </G>
      <Circle cx={100} cy={106} r={21} fill={color} />
      <Rect x={97.5} y={93} width={5} height={15} rx={2.5} fill="#FFFFFF" />
      <Circle cx={100} cy={115} r={3} fill="#FFFFFF" />
    </Svg>
  );
}

function CoinStack({ x, y, count, color }: { x: number; y: number; count: number; color: string }) {
  return (
    <G>
      {Array.from({ length: count }, (_, i) => {
        const cy = y - i * 11;
        return (
          <G key={i}>
            <Rect x={x - 34} y={cy} width={68} height={11} fill={withAlpha(color, 0.75)} />
            <Ellipse cx={x} cy={cy + 11} rx={34} ry={11} fill={withAlpha(color, 0.75)} />
            <Ellipse cx={x} cy={cy} rx={34} ry={11} fill={color} />
            <Ellipse cx={x} cy={cy} rx={24} ry={6.5} fill="none" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={1.5} />
          </G>
        );
      })}
    </G>
  );
}

export function CashArt({ color }: { color: string }) {
  return (
    <Svg width={160} height={160} viewBox="0 0 160 160">
      <CoinStack x={64} y={62} count={4} color={color} />
      <CoinStack x={58} y={138} count={2} color={color} />
      <Circle cx={112} cy={96} r={34} fill="#000000" fillOpacity={0.35} />
      <Path d="M96 80 L110 94 L118 86 L128 110 M128 110 L104 106" fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SparkleArt({ color }: { color: string }) {
  const star = (cx: number, cy: number, r: number) =>
    `M${cx} ${cy - r} C${cx + r * 0.15} ${cy - r * 0.15} ${cx + r * 0.15} ${cy - r * 0.15} ${cx + r} ${cy} C${cx + r * 0.15} ${cy + r * 0.15} ${cx + r * 0.15} ${cy + r * 0.15} ${cx} ${cy + r} C${cx - r * 0.15} ${cy + r * 0.15} ${cx - r * 0.15} ${cy + r * 0.15} ${cx - r} ${cy} C${cx - r * 0.15} ${cy - r * 0.15} ${cx - r * 0.15} ${cy - r * 0.15} ${cx} ${cy - r}Z`;
  return (
    <Svg width={150} height={150} viewBox="0 0 150 150">
      <Circle cx={84} cy={80} r={46} fill={withAlpha(color, 0.14)} />
      <Path d={star(80, 78, 44)} fill={color} />
      <Path d={star(118, 40, 17)} fill={withAlpha(color, 0.7)} />
      <Path d={star(122, 112, 12)} fill={withAlpha(color, 0.5)} />
    </Svg>
  );
}
