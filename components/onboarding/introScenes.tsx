import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, withAlpha } from '@/theme';
import { Text } from '@/components/primitives';
import { BankLogo } from '@/components/finance/BankLogo';
import { VademdeMark } from '@/components/brand/VademdeMark';

// Tanışma sahneleri: örnek veriyle çizilen sabit illüstrasyonlardır (gerçek veri okunmaz).
// App Store v3 setiyle (assets/appstore/v3) aynı görsel dil: çerçevesiz, marka ışığı üzerinde yüzen öğeler.
// Kâğıt belge renkleri bir "fiziksel kâğıt" illüstrasyonudur ve temadan bağımsızdır.
export interface IntroSceneProps {
  active?: boolean;
  height: number;
}

const PAPER = '#F7F3E8';
const PAPER_INK = '#2A2B30';
const PAPER_MUTED = '#8F8D85';
const PAPER_LINE = '#D6D1C2';

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/** Sayfa görünür olduğunda 0→1 giriş değeri; hareket azaltılmışsa doğrudan 1. */
function useEntrance(active: boolean | undefined, delay = 0) {
  const reduce = useReduceMotion();
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) {
      value.setValue(0);
      return;
    }
    if (reduce) {
      value.setValue(1);
      return;
    }
    const anim = Animated.timing(value, {
      toValue: 1,
      duration: 520,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [active, reduce, delay, value]);
  return value;
}

function SceneGlow({ height }: { height: number }) {
  const theme = useTheme();
  const strength = theme.scheme === 'dark' ? 0.26 : 0.2;
  return (
    <Svg style={{ position: 'absolute', left: 0, right: 0, top: 0 }} width="100%" height={height}>
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="48%" rx="58%" ry="50%">
          <Stop offset="0" stopColor={theme.colors.brandPrimary} stopOpacity={strength} />
          <Stop offset="1" stopColor={theme.colors.brandPrimary} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="glow2" cx="10%" cy="100%" rx="55%" ry="45%">
          <Stop offset="0" stopColor={theme.colors.accentViolet} stopOpacity={strength * 0.8} />
          <Stop offset="1" stopColor={theme.colors.accentViolet} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#glow)" />
      <Rect width="100%" height="100%" fill="url(#glow2)" />
    </Svg>
  );
}

function FloatingCard({ children, style }: { children: React.ReactNode; style?: object }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          borderRadius: 18,
          backgroundColor: theme.colors.surfaceElevated,
          shadowColor: '#000',
          shadowOpacity: theme.scheme === 'dark' ? 0.4 : 0.12,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 12 },
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function FieldTag({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        top: -22,
        left: -2,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 5,
        backgroundColor: theme.colors.brandPrimary,
      }}
    >
      <Text style={{ fontSize: 10, lineHeight: 13, fontWeight: '700', color: theme.colors.onAction }}>{label}</Text>
    </View>
  );
}

// 1 · Belgeyi çekin: vizör köşeleri içinde çek, akan tarama çizgisi, okunan alanlar ve oluşan kayıt.
export function ScanIntroScene({ active, height }: IntroSceneProps) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const [scan] = useState(() => new Animated.Value(0));
  const result = useEntrance(active, 650);

  useEffect(() => {
    if (!active || reduce) {
      scan.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scan, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduce, scan]);

  const finderTop = height * 0.08;
  const finderHeight = Math.min(230, height * 0.56);
  const corner = { position: 'absolute' as const, width: 30, height: 30, borderColor: theme.colors.brandPrimary };

  return (
    <View accessible accessibilityLabel="Çek fotoğrafından Kuzey İnşaat için 120 bin liralık alacak kaydı oluşur" style={{ height }}>
      <SceneGlow height={height} />

      <View style={{ position: 'absolute', left: 36, right: 36, top: finderTop, height: finderHeight }}>
        <View style={[corner, { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 12 }]} />
        <View style={[corner, { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 12 }]} />
        <View style={[corner, { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 12 }]} />
        <View style={[corner, { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 12 }]} />

        <View
          style={{
            position: 'absolute',
            left: 22,
            right: 22,
            top: finderHeight * 0.16,
            height: finderHeight * 0.68,
            borderRadius: 8,
            backgroundColor: PAPER,
            paddingHorizontal: 16,
            paddingVertical: 14,
            justifyContent: 'space-between',
            transform: [{ rotate: '-4deg' }],
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 10 },
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.3, color: PAPER_INK }}>KUZEY BANK A.Ş.</Text>
            <Text mono style={{ fontSize: 9, color: PAPER_MUTED }}>
              No 0047219
            </Text>
          </View>
          <View style={{ gap: 6 }}>
            <View style={{ width: '64%', height: 4, borderRadius: 2, backgroundColor: PAPER_LINE }} />
            <View style={{ width: '42%', height: 4, borderRadius: 2, backgroundColor: PAPER_LINE }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View style={{ paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, borderWidth: 2, borderColor: theme.colors.brandPrimary, backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16) }}>
              <FieldTag label="Vade ✓" />
              <Text mono style={{ fontSize: 10, color: PAPER_INK }}>
                27.10.2026
              </Text>
            </View>
            <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, borderWidth: 2, borderColor: theme.colors.brandPrimary, backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16) }}>
              <FieldTag label="Tutar ✓" />
              <Text mono style={{ fontSize: 13, fontWeight: '700', color: PAPER_INK }}>
                ₺120.000,00
              </Text>
            </View>
          </View>
        </View>

        <Animated.View
          style={{
            position: 'absolute',
            left: 14,
            right: 14,
            top: finderHeight * 0.1,
            height: 3,
            borderRadius: 2,
            backgroundColor: theme.colors.brandPrimary,
            shadowColor: theme.colors.brandPrimary,
            shadowOpacity: 0.9,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 0 },
            transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [0, finderHeight * 0.8] }) }],
          }}
        />
      </View>

      <Animated.View
        style={{
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: height * 0.05,
          opacity: result,
          transform: [{ translateY: result.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
        }}
      >
        <FloatingCard style={{ minHeight: 64, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BankLogo bankCode="turkiye-garanti-bankasi" size={38} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontWeight: '600' }}>Alınan çek</Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              Kuzey İnşaat · 27 Eki
            </Text>
          </View>
          <Text tabular color="receivable" style={{ fontWeight: '700' }}>
            +₺120.000,00
          </Text>
        </FloatingCard>
      </Animated.View>
    </View>
  );
}

// 2 · Her kaydı siz onaylarsınız: alan alan "belgeden" / "kontrol edin" etiketleri ve güven rozeti.
export function ConfirmIntroScene({ active, height }: IntroSceneProps) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(0));
  const badge = useEntrance(active, 250);

  useEffect(() => {
    if (!active || reduce) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduce, pulse]);

  const rows: { label: string; value: string; tag: string; warn?: boolean; big?: boolean }[] = [
    { label: 'Tutar', value: '₺120.000,00', tag: 'belgeden', big: true },
    { label: 'Vade tarihi', value: '27 Ekim 2026', tag: 'kontrol edin', warn: true },
    { label: 'Keşideci', value: 'Kuzey İnşaat Ltd.', tag: 'belgeden' },
  ];
  const warnBg = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [withAlpha(theme.colors.brandPrimary, 0.1), withAlpha(theme.colors.brandPrimary, 0.24)],
  });

  return (
    <View accessible accessibilityLabel="Okunan alanlar önce size gösterilir; emin olunmayan vade tarihi işaretlenir" style={{ height, justifyContent: 'center', paddingHorizontal: 20 }}>
      <SceneGlow height={height} />

      <FloatingCard style={{ overflow: 'hidden' }}>
        {rows.map((row, index) => {
          const content = (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text variant="caption" color="textSecondary" style={{ fontSize: 13 }}>
                  {row.label}
                </Text>
                <Ionicons
                  name={row.warn ? 'alert-circle' : 'checkmark-circle'}
                  size={13}
                  color={row.warn ? theme.colors.attentionMarker : theme.colors.receivable}
                />
                <Text style={{ fontSize: 11, fontWeight: '600', color: row.warn ? theme.colors.attentionMarker : theme.colors.receivable }}>
                  {row.tag}
                </Text>
              </View>
              <Text tabular style={{ fontSize: row.big ? 24 : 17, fontWeight: row.big ? '700' : '400' }}>
                {row.value}
              </Text>
            </>
          );
          const rowStyle = {
            minHeight: 62,
            paddingHorizontal: 16,
            paddingVertical: 11,
            justifyContent: 'center' as const,
            gap: 3,
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: theme.colors.separator,
          };
          return row.warn ? (
            <Animated.View key={row.label} style={[rowStyle, { backgroundColor: warnBg }]}>
              {content}
            </Animated.View>
          ) : (
            <View key={row.label} style={rowStyle}>
              {content}
            </View>
          );
        })}
        <View style={{ padding: 12, paddingTop: 4 }}>
          <View style={{ height: 46, borderRadius: 13, backgroundColor: theme.colors.action, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
            <Ionicons name="checkmark" size={18} color={theme.colors.onAction} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.onAction }}>Onayla ve kaydet</Text>
          </View>
        </View>
      </FloatingCard>

      <Animated.View
        style={{
          position: 'absolute',
          top: height * 0.04,
          left: 12,
          opacity: badge,
          transform: [{ scale: badge.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
        }}
      >
        <FloatingCard style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 2, borderColor: theme.colors.brandPrimary }}>
          <Ionicons name="scan-outline" size={16} color={theme.colors.textPrimary} />
          <Text style={{ fontSize: 15, fontWeight: '700' }}>Güven %99</Text>
        </FloatingCard>
      </Animated.View>
    </View>
  );
}

const WEEKDAYS = ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'];

// 3 · Hiçbir vade sessizce geçmez: mini takvim + yukarıdan kayan bildirim.
export function DueIntroScene({ active, height }: IntroSceneProps) {
  const theme = useTheme();
  const banner = useEntrance(active, 450);
  const days = [...Array<null>(3).fill(null), ...Array.from({ length: 31 }, (_, i) => i + 1)];
  const dots: Record<number, string[]> = {
    2: [theme.colors.danger],
    9: [theme.colors.receivable],
    12: [theme.colors.payable],
    15: [theme.colors.payable, theme.colors.brandPrimary],
    20: [theme.colors.payable],
    25: [theme.colors.brandPrimary],
    27: [theme.colors.accentViolet, theme.colors.receivable],
  };
  const today = 26;

  return (
    <View accessible accessibilityLabel="Ekim takviminde vade günleri ve 'Çek vadesi yarın' bildirimi" style={{ height, paddingHorizontal: 20, justifyContent: 'flex-end', paddingBottom: height * 0.04 }}>
      <SceneGlow height={height} />

      <FloatingCard style={{ paddingVertical: 12, paddingHorizontal: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
          <Text style={{ fontWeight: '700', fontSize: 17 }}>Ekim 2026</Text>
          <Text variant="caption" color="textSecondary">
            7 vade
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, rowGap: 2 }}>
          {WEEKDAYS.map((d, i) => (
            <Text key={`w${i}`} variant="caption" color="textSecondary" style={{ width: '14.28%', textAlign: 'center' }}>
              {d}
            </Text>
          ))}
          {days.map((n, i) => {
            const isToday = n === today;
            return (
              <View key={`d${i}`} style={{ width: '14.28%', alignItems: 'center', height: 31 }}>
                {n ? (
                  <>
                    <View
                      style={{
                        width: 25,
                        height: 25,
                        borderRadius: 13,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isToday ? theme.colors.brandPrimary : 'transparent',
                      }}
                    >
                      <Text tabular style={{ fontSize: 13, fontWeight: isToday ? '700' : '400', color: isToday ? theme.colors.onAction : theme.colors.textPrimary }}>
                        {n}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
                      {(dots[n] ?? []).map((c, k) => (
                        <View key={k} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c }} />
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            );
          })}
        </View>
      </FloatingCard>

      <Animated.View
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          top: height * 0.02,
          opacity: banner,
          transform: [{ translateY: banner.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        }}
      >
        <FloatingCard style={{ padding: 12, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: theme.colors.backgroundPrimary, alignItems: 'center', justifyContent: 'center' }}>
            <VademdeMark size={30} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 15, fontWeight: '600' }}>Çek vadesi yarın</Text>
              <Text variant="caption" color="textSecondary">
                şimdi
              </Text>
            </View>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              Kuzey İnşaat · ₺120.000,00 · Garanti BBVA
            </Text>
          </View>
        </FloatingCard>
      </Animated.View>
    </View>
  );
}
