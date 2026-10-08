import { Image, type ImageSourcePropType } from 'react-native';

// Ana sayfa kartlarının 3D illüstrasyonları (assets/home/*.png — şeffaf PNG, koyu zemin için hazırlanmış).
// Boyutlar görselin en/boy oranından türetilir; çağıran yalnızca görünür genişliği verir.
function Art({ source, width, ratio }: { source: ImageSourcePropType; width: number; ratio: number }) {
  return <Image source={source} accessible={false} resizeMode="contain" style={{ width, height: width * ratio }} />;
}

export function WalletArt({ width = 168 }: { width?: number }) {
  return <Art source={require('@/assets/home/wallet.png')} width={width} ratio={629 / 720} />;
}

export function OverdueArt({ width = 150 }: { width?: number }) {
  return <Art source={require('@/assets/home/overdue.png')} width={width} ratio={720 / 706} />;
}

export function CashArt({ width = 176 }: { width?: number }) {
  return <Art source={require('@/assets/home/cash.png')} width={width} ratio={544 / 720} />;
}

export function SparkleArt({ width = 132 }: { width?: number }) {
  return <Art source={require('@/assets/home/insight.png')} width={width} ratio={720 / 661} />;
}
