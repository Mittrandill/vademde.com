import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { withAlpha } from '@/theme/colors';

// Ana sayfa kartlarının dekoratif illüstrasyonları. Renkler tema tokenlarından gelir; beyaz/siyah
// yalnızca ışık-gölge katmanlarında alfa ile kullanılır. Degrade kimlikleri ekran başına tek örnek içindir.
function Glow({ id, color, strength = 0.5 }: { id: string; color: string; strength?: number }) {
  return (
    <RadialGradient id={id} cx="50%" cy="50%" r="50%">
      <Stop offset="0" stopColor={color} stopOpacity={strength} />
      <Stop offset="1" stopColor={color} stopOpacity={0} />
    </RadialGradient>
  );
}

export function WalletArt({ accent, tone, scale = 1 }: { accent: string; tone: string; scale?: number }) {
  return (
    <Svg width={190 * scale} height={170 * scale} viewBox="0 0 220 196">
      <Defs>
        <LinearGradient id="w-back" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={tone} stopOpacity={0.2} />
          <Stop offset="1" stopColor={tone} stopOpacity={0.07} />
        </LinearGradient>
        <LinearGradient id="w-mid" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={tone} stopOpacity={0.26} />
          <Stop offset="1" stopColor={tone} stopOpacity={0.1} />
        </LinearGradient>
        <LinearGradient id="w-front" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={tone} stopOpacity={0.32} />
          <Stop offset="1" stopColor={tone} stopOpacity={0.12} />
        </LinearGradient>
        <LinearGradient id="w-gold" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={accent} stopOpacity={1} />
          <Stop offset="1" stopColor={accent} stopOpacity={0.72} />
        </LinearGradient>
      </Defs>
      <G rotation={-18} origin="110, 98">
        <Rect x={46} y={22} width={170} height={104} rx={20} fill="url(#w-back)" />
        <Path d="M66 22 H196 A20 20 0 0 1 216 42 V50 H46 V42 A20 20 0 0 1 66 22 Z" fill="url(#w-gold)" />
        <Rect x={30} y={52} width={170} height={104} rx={20} fill="url(#w-mid)" stroke="#FFFFFF" strokeOpacity={0.1} strokeWidth={1} />
        <Rect x={56} y={92} width={170} height={96} rx={20} fill="url(#w-front)" stroke="#FFFFFF" strokeOpacity={0.12} strokeWidth={1} />
      </G>
    </Svg>
  );
}

export function OverdueArt({ color }: { color: string }) {
  return (
    <Svg width={176} height={176} viewBox="0 0 176 176">
      <Defs>
        <Glow id="o-glow" color={color} strength={0.55} />
        <LinearGradient id="o-paper" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
          <Stop offset="1" stopColor="#FFD9D6" stopOpacity={0.8} />
        </LinearGradient>
        <RadialGradient id="o-badge" cx="35%" cy="30%" r="80%">
          <Stop offset="0" stopColor="#FF8C86" />
          <Stop offset="1" stopColor={color} />
        </RadialGradient>
      </Defs>
      <Circle cx={96} cy={102} r={74} fill="url(#o-glow)" />
      <G rotation={12} origin="82, 82">
        <Rect x={50} y={30} width={78} height={104} rx={11} fill="#000000" fillOpacity={0.22} />
        <Rect x={44} y={22} width={78} height={104} rx={11} fill="url(#o-paper)" />
        <Path d="M104 22 H111 A11 11 0 0 1 122 33 V40 Z" fill={color} fillOpacity={0.25} />
        {[44, 60, 76, 92].map((y, i) => (
          <Rect key={y} x={56} y={y} width={i === 3 ? 30 : 48} height={7} rx={3.5} fill={color} fillOpacity={0.5} />
        ))}
      </G>
      <Circle cx={116} cy={116} r={29} fill={color} fillOpacity={0.22} />
      <Circle cx={116} cy={116} r={23} fill="url(#o-badge)" />
      <Circle cx={116} cy={116} r={23} fill="none" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={1.5} />
      <Rect x={113} y={103} width={6} height={17} rx={3} fill="#FFFFFF" />
      <Circle cx={116} cy={127} r={3.4} fill="#FFFFFF" />
    </Svg>
  );
}

function Coin({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <G>
      <Rect x={cx - 36} y={cy} width={72} height={12} fill={color} />
      <Rect x={cx - 36} y={cy} width={72} height={12} fill="#000000" fillOpacity={0.3} />
      {[-24, -12, 0, 12, 24].map((dx) => (
        <Rect key={dx} x={cx + dx - 1} y={cy + 3} width={2} height={9} fill="#000000" fillOpacity={0.18} />
      ))}
      <Ellipse cx={cx} cy={cy + 12} rx={36} ry={12} fill={color} />
      <Ellipse cx={cx} cy={cy + 12} rx={36} ry={12} fill="#000000" fillOpacity={0.3} />
      <Ellipse cx={cx} cy={cy} rx={36} ry={12} fill={color} />
      <Ellipse cx={cx} cy={cy} rx={36} ry={12} fill="url(#c-shine)" />
      <Ellipse cx={cx} cy={cy} rx={26} ry={7.5} fill="none" stroke="#000000" strokeOpacity={0.2} strokeWidth={1.5} />
    </G>
  );
}

export function CashArt({ color }: { color: string }) {
  return (
    <Svg width={180} height={176} viewBox="0 0 180 176">
      <Defs>
        <Glow id="c-glow" color={color} strength={0.5} />
        <LinearGradient id="c-shine" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
        <RadialGradient id="c-disc" cx="40%" cy="30%" r="80%">
          <Stop offset="0" stopColor="#3A2A06" />
          <Stop offset="1" stopColor="#140E02" />
        </RadialGradient>
      </Defs>
      <Circle cx={96} cy={96} r={80} fill="url(#c-glow)" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Coin key={`a${i}`} cx={66} cy={78 - i * 12} color={color} />
      ))}
      {[0, 1, 2].map((i) => (
        <Coin key={`b${i}`} cx={64} cy={150 - i * 12} color={color} />
      ))}
      <Circle cx={124} cy={104} r={38} fill="url(#c-disc)" fillOpacity={0.92} />
      <Circle cx={124} cy={104} r={38} fill="none" stroke={color} strokeOpacity={0.4} strokeWidth={1.5} />
      <Path d="M102 88 L116 102 L125 93 L142 112" fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M127 114 L143 114 L143 98" fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SparkleArt({ color }: { color: string }) {
  const star = (cx: number, cy: number, r: number) => {
    const k = r * 0.14;
    return `M${cx} ${cy - r} C${cx + k} ${cy - k} ${cx + k} ${cy - k} ${cx + r} ${cy} C${cx + k} ${cy + k} ${cx + k} ${cy + k} ${cx} ${cy + r} C${cx - k} ${cy + k} ${cx - k} ${cy + k} ${cx - r} ${cy} C${cx - k} ${cy - k} ${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
  };
  return (
    <Svg width={176} height={176} viewBox="0 0 176 176">
      <Defs>
        <Glow id="s-glow" color={color} strength={0.55} />
        <LinearGradient id="s-star" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
          <Stop offset="0.45" stopColor={color} stopOpacity={1} />
          <Stop offset="1" stopColor={color} stopOpacity={0.75} />
        </LinearGradient>
      </Defs>
      <Circle cx={92} cy={96} r={76} fill="url(#s-glow)" />
      <Path d={star(88, 94, 58)} fill="url(#s-star)" />
      <Path d={star(138, 42, 22)} fill={withAlpha(color, 0.85)} />
      <Path d={star(140, 138, 15)} fill={withAlpha(color, 0.6)} />
      <Path d={star(40, 36, 10)} fill={withAlpha(color, 0.5)} />
    </Svg>
  );
}
