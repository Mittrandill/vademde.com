import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Pressable, Row, Stack, Text } from '@/components/primitives';
import { fadeUp, popIn, useLoop, useReduceMotion, useStaged } from './motion';

// docs/08-tasarim-sistemi.md §12.8 — onboarding sahneleri ince yay/halka gibi düşük opaklıklı
// geometriyi yalnızca burada kullanabilir; finans verisinin okunabilirliği bozulmaz. Tüm renkler
// tema tokenlarından gelir, sabit kodlanmaz (yalnızca "belge kâğıdı" fotoğraf gerçekçiliği için).
export interface SceneProps {
  active: boolean;
}

const PAPER = '#E9E7DF';
const PAPER_INK = '#202226';
const PAPER_MUTED = '#7B7A72';

// --- 1. Belge Tara: uygulamadaki Tara sekmesinin seçim ekranı ---------------------------------

export function ScanHeroScene({ active }: SceneProps) {
  const theme = useTheme();
  const pulse = useLoop(active, 1800);
  const [pillIn, cardIn] = useStaged(2, active, { base: 150, step: 200 });

  return (
    <Stack gap="md" style={{ width: '100%' }}>
      <Animated.View style={[fadeUp(pillIn), { alignSelf: 'flex-start' }]}>
        <Row
          gap="xs"
          align="center"
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfacePrimary,
          }}
        >
          <Ionicons name="document-text-outline" size={15} color={theme.colors.textSecondary} />
          <Text variant="caption" color="textSecondary">
            Kalan OCR kotanız:{' '}
            <Text variant="caption" tabular style={{ color: theme.colors.brandPrimary, fontWeight: '700' }}>
              5
            </Text>{' '}
            / 5
          </Text>
        </Row>
      </Animated.View>

      <Animated.View style={fadeUp(cardIn)}>
        <Card elevated style={{ borderRadius: theme.radius.heroWidget, paddingVertical: theme.spacing.xl, alignItems: 'center' }}>
          <Stack gap="md" align="center">
            <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View
                style={{
                  position: 'absolute',
                  width: 200,
                  height: 200,
                  borderRadius: 100,
                  backgroundColor: withAlpha(theme.colors.brandPrimary, 0.1),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
                }}
              />
              <Animated.View
                style={{
                  position: 'absolute',
                  width: 156,
                  height: 156,
                  borderRadius: 78,
                  backgroundColor: withAlpha(theme.colors.brandPrimary, 0.18),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
                }}
              />
              <View
                style={{
                  width: 110,
                  height: 110,
                  borderRadius: 55,
                  backgroundColor: theme.colors.brandPrimary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="camera-outline" size={48} color={theme.colors.brandPrimaryText} />
              </View>
            </View>
            <Stack gap="xxs" align="center">
              <Text variant="sectionTitle">Kameradan Tara</Text>
              <Text variant="caption" color="textSecondary">
                Belgeyi kamerayla çekerek tara
              </Text>
            </Stack>
          </Stack>
        </Card>
      </Animated.View>
    </Stack>
  );
}

// --- 2. Canlı tarama: tara.tsx'teki çerçeve, köşe işaretleri ve ilerleme hapı ------------------

const FRAME_WIDTH = 240;
const FRAME_HEIGHT = 290;
const CORNER = 26;

function CornerBrackets({ color }: { color: string }) {
  const base = { position: 'absolute' as const, width: CORNER, height: CORNER, borderColor: color };
  return (
    <>
      <View style={[base, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 }]} />
      <View style={[base, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 }]} />
      <View style={[base, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 }]} />
      <View style={[base, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 }]} />
    </>
  );
}

const PROGRESS_STEPS: { atMs: number; label: string }[] = [
  { atMs: 0, label: 'Taranıyor... %25' },
  { atMs: 1100, label: 'Taranıyor... %65' },
  { atMs: 2300, label: 'Tamamlandı %100' },
];

export function ScanningScene({ active }: SceneProps) {
  const theme = useTheme();
  const sweep = useLoop(active, 1400);
  const [frameIn] = useStaged(1, active, { base: 100 });
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setStepIndex(0);
      return undefined;
    }
    const timers = PROGRESS_STEPS.map((step, index) => setTimeout(() => setStepIndex(index), step.atMs));
    return () => timers.forEach(clearTimeout);
  }, [active]);

  const done = stepIndex === PROGRESS_STEPS.length - 1;

  return (
    <Animated.View style={[fadeUp(frameIn), { alignItems: 'center' }]}>
      <View
        style={{
          width: FRAME_WIDTH + 40,
          height: FRAME_HEIGHT + 40,
          borderRadius: theme.radius.heroWidget,
          backgroundColor: '#000',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: FRAME_WIDTH - 44,
            height: FRAME_HEIGHT - 46,
            backgroundColor: PAPER,
            borderRadius: 6,
            padding: 14,
            gap: 10,
            transform: [{ rotate: '-3deg' }],
          }}
        >
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="caption" style={{ color: PAPER_MUTED, fontSize: 9, letterSpacing: 1.2 }}>
              ÇEK
            </Text>
            <Text variant="caption" style={{ color: PAPER_MUTED, fontSize: 9 }}>
              No 0004817
            </Text>
          </Row>
          <PaperField label="TUTAR" value="185.000,00 TL" large />
          <PaperField label="VADE" value="14.11.2026" />
          <PaperField label="KEŞİDECİ" value="Yıldız Ticaret A.Ş." />
        </View>

        <View style={{ position: 'absolute', width: FRAME_WIDTH, height: FRAME_HEIGHT, alignItems: 'center' }}>
          {!done ? (
            <Animated.View
              style={{
                position: 'absolute',
                top: 0,
                left: 8,
                right: 8,
                height: 3,
                borderRadius: 2,
                backgroundColor: theme.colors.brandPrimary,
                opacity: 0.85,
                transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [0, FRAME_HEIGHT - 6] }) }],
              }}
            />
          ) : null}
          <CornerBrackets color={done ? theme.colors.success : theme.colors.brandPrimary} />
        </View>

        <Row
          align="center"
          gap="xs"
          style={{
            position: 'absolute',
            bottom: 12,
            paddingHorizontal: 16,
            paddingVertical: 9,
            borderRadius: theme.radius.pill,
            backgroundColor: withAlpha('#000000', 0.6),
          }}
        >
          {done ? (
            <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
          ) : (
            <Ionicons name="sync" size={16} color={theme.colors.brandPrimary} />
          )}
          <Text variant="caption" tabular style={{ color: '#fff' }}>
            {PROGRESS_STEPS[stepIndex].label}
          </Text>
        </Row>
      </View>
    </Animated.View>
  );
}

function PaperField({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption" style={{ color: PAPER_MUTED, fontSize: 8, letterSpacing: 1 }}>
        {label}
      </Text>
      <Text
        variant="body"
        tabular
        style={{ color: PAPER_INK, fontSize: large ? 19 : 13, fontWeight: large ? '700' : '500' }}
      >
        {value}
      </Text>
    </View>
  );
}

// --- 3. Sonuç ve onay: okunan alanlar güven yüzdesiyle, kayıt yalnızca onayla oluşur ------------

const REVIEW_ROWS: { label: string; value: string; confidence: string; big?: boolean }[] = [
  { label: 'TUTAR', value: '185.000,00 TL', confidence: '%99', big: true },
  { label: 'VADE', value: '14.11.2026', confidence: '%98' },
  { label: 'TÜR', value: 'Çek · Alacak', confidence: '%97' },
  { label: 'KEŞİDECİ', value: 'Yıldız Ticaret A.Ş.', confidence: '%96' },
];

export function ReviewScene({ active }: SceneProps) {
  const theme = useTheme();
  const staged = useStaged(REVIEW_ROWS.length + 1, active, { base: 150, step: 260 });
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    if (!active) setApproved(false);
  }, [active]);

  return (
    <Stack gap="sm" style={{ width: '100%' }}>
      <Card style={{ paddingVertical: theme.spacing.xs }}>
        {REVIEW_ROWS.map((row, index) => (
          <Animated.View key={row.label} style={fadeUp(staged[index], 10)}>
            <Row
              align="center"
              style={{
                paddingVertical: 10,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Text variant="caption" color="textSecondary" style={{ letterSpacing: 1 }}>
                  {row.label}
                </Text>
                <Text variant="body" tabular style={row.big ? { fontSize: 22, fontWeight: '600' } : undefined}>
                  {row.value}
                </Text>
              </Stack>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: theme.radius.pill,
                  backgroundColor: withAlpha(theme.colors.success, 0.14),
                }}
              >
                <Text variant="caption" tabular style={{ color: theme.colors.success, fontWeight: '600' }}>
                  {row.confidence}
                </Text>
              </View>
            </Row>
          </Animated.View>
        ))}
      </Card>

      <Animated.View style={fadeUp(staged[REVIEW_ROWS.length], 10)}>
        <Row
          align="center"
          gap="sm"
          style={{
            padding: 10,
            paddingLeft: 16,
            borderRadius: theme.radius.widget,
            backgroundColor: theme.colors.surfaceElevated,
          }}
        >
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
            {approved ? 'Vade takvimine eklendi · 14 Kas' : 'Sen onaylamadan kayıt oluşmaz.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Onayla"
            onPress={() => setApproved(true)}
            style={{
              minHeight: 44,
              minWidth: 104,
              paddingHorizontal: 14,
              borderRadius: theme.radius.input,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: approved ? theme.colors.success : theme.colors.brandPrimary,
            }}
          >
            <Text variant="cardTitle" style={{ color: theme.colors.brandPrimaryText }}>
              {approved ? 'Kaydedildi' : 'Onayla'}
            </Text>
          </Pressable>
        </Row>
      </Animated.View>
    </Stack>
  );
}

// --- 4. Çalışma alanları ve ekip ---------------------------------------------------------------

const WORKSPACES = ['Kişisel', 'Yıldız Tic.', 'Market'];

const AVATARS: { letter: string; tone: 'brand' | 'violet' | 'aqua' | 'muted' }[] = [
  { letter: 'A', tone: 'brand' },
  { letter: 'M', tone: 'violet' },
  { letter: 'S', tone: 'aqua' },
  { letter: 'B', tone: 'muted' },
];

export function TeamScene({ active }: SceneProps) {
  const theme = useTheme();
  const staged = useStaged(2 + AVATARS.length + 1, active, { base: 150, step: 170 });
  const [workspace, setWorkspace] = useState(0);

  useEffect(() => {
    if (!active) {
      setWorkspace(0);
      return undefined;
    }
    const timer = setInterval(() => setWorkspace((current) => (current === 0 ? 1 : 0)), 2600);
    return () => clearInterval(timer);
  }, [active]);

  function toneColors(tone: 'brand' | 'violet' | 'aqua' | 'muted') {
    if (tone === 'brand') return { bg: theme.colors.brandPrimary, fg: theme.colors.brandPrimaryText };
    if (tone === 'violet') return { bg: theme.colors.accentViolet, fg: '#FFFFFF' };
    if (tone === 'aqua') return { bg: theme.colors.accentAqua, fg: '#06232A' };
    return { bg: theme.colors.surfaceElevated, fg: theme.colors.textPrimary };
  }

  return (
    <Stack gap="sm" style={{ width: '100%' }}>
      <Animated.View style={fadeUp(staged[0], -14)}>
        <Row
          gap="sm"
          align="center"
          style={{
            padding: 12,
            borderRadius: theme.radius.widget,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceElevated,
          }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.accentViolet,
            }}
          >
            <Text variant="caption" style={{ color: '#fff', fontWeight: '700' }}>
              Y
            </Text>
          </View>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle">Yıldız Ticaret</Text>
            <Text variant="caption" color="textSecondary">
              seni ekibe davet etti
            </Text>
          </Stack>
        </Row>
      </Animated.View>

      <Animated.View style={fadeUp(staged[1])}>
        <Card style={{ borderRadius: theme.radius.heroWidget, padding: theme.spacing.md }}>
          <Stack gap="md">
            <Row
              style={{
                padding: 4,
                borderRadius: theme.radius.widget,
                backgroundColor: theme.colors.backgroundPrimary,
              }}
            >
              {WORKSPACES.map((name, index) => {
                const selected = index === workspace;
                return (
                  <View
                    key={name}
                    style={{
                      flex: 1,
                      minHeight: 38,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: theme.radius.input,
                      backgroundColor: selected ? theme.colors.brandPrimary : 'transparent',
                    }}
                  >
                    <Text
                      variant="caption"
                      numberOfLines={1}
                      style={{
                        fontWeight: '600',
                        color: selected ? theme.colors.brandPrimaryText : theme.colors.textSecondary,
                      }}
                    >
                      {name}
                    </Text>
                  </View>
                );
              })}
            </Row>

            <Row align="center" style={{ justifyContent: 'space-between' }}>
              <Row>
                {AVATARS.map((avatar, index) => {
                  const colors = toneColors(avatar.tone);
                  return (
                    <Animated.View
                      key={avatar.letter}
                      style={[popIn(staged[2 + index]), { marginLeft: index === 0 ? 0 : -12 }]}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          borderWidth: 3,
                          borderColor: theme.colors.surfacePrimary,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: colors.bg,
                        }}
                      >
                        <Text variant="cardTitle" style={{ color: colors.fg }}>
                          {avatar.letter}
                        </Text>
                      </View>
                    </Animated.View>
                  );
                })}
                <Animated.View style={[popIn(staged[2 + AVATARS.length]), { marginLeft: -12 }]}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      borderWidth: 2,
                      borderStyle: 'dashed',
                      borderColor: theme.colors.brandPrimary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="add" size={22} color={theme.colors.brandPrimary} />
                  </View>
                </Animated.View>
              </Row>
              <Stack gap="xxs" align="flex-end">
                <Text variant="sectionTitle" tabular>
                  4 / 10
                </Text>
                <Text variant="caption" color="textSecondary">
                  ekip üyesi
                </Text>
              </Stack>
            </Row>

            <Row gap="xs" style={{ flexWrap: 'wrap' }}>
              <RolePill color={theme.colors.brandPrimary} label="Sahip" />
              <RolePill color={theme.colors.accentViolet} label="Düzenleyici" />
              <RolePill color={theme.colors.textSecondary} label="Görüntüleyici" />
            </Row>
          </Stack>
        </Card>
      </Animated.View>
    </Stack>
  );
}

function RolePill({ color, label }: { color: string; label: string }) {
  const theme = useTheme();
  return (
    <Row
      gap="xs"
      align="center"
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.backgroundPrimary,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </Row>
  );
}

// --- 5. 7 gün ücretsiz -------------------------------------------------------------------------

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_SIZE = 128;
const RING_STROKE = 9;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const TRIAL_DAYS: { label: string; caption: string; tone: 'brand' | 'aqua' | 'violet' }[] = [
  { label: 'Bugün', caption: 'Tüm özellikler açılır', tone: 'brand' },
  { label: '5. gün', caption: 'Sana haber veririz', tone: 'aqua' },
  { label: '7. gün', caption: 'Ücretlendirme başlar', tone: 'violet' },
];

const UNLOCKS: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }[] = [
  { icon: 'camera-outline', value: '100', label: 'belge tarama / ay' },
  { icon: 'albums-outline', value: '10', label: 'çalışma alanı' },
  { icon: 'bar-chart-outline', value: 'Gelişmiş', label: 'raporlar' },
  { icon: 'folder-open-outline', value: 'Belge', label: 'arşivi' },
];

export function TrialScene({ active }: SceneProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const ring = useRef(new Animated.Value(0)).current;
  const strip = useRef(new Animated.Value(0)).current;
  const staged = useStaged(TRIAL_DAYS.length + UNLOCKS.length + 1, active, { base: 500, step: 200 });

  useEffect(() => {
    if (!active) {
      ring.setValue(0);
      strip.setValue(0);
      return undefined;
    }
    if (reduceMotion) {
      ring.setValue(1);
      strip.setValue(1);
      return undefined;
    }
    const animation = Animated.parallel([
      Animated.timing(ring, { toValue: 1, duration: 1600, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(strip, { toValue: 1, duration: 1800, delay: 700, useNativeDriver: false }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [active, reduceMotion, ring, strip]);

  function toneColor(tone: 'brand' | 'aqua' | 'violet') {
    if (tone === 'brand') return theme.colors.brandPrimary;
    if (tone === 'aqua') return theme.colors.accentAqua;
    return theme.colors.accentViolet;
  }

  return (
    <Stack gap="md" style={{ width: '100%' }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={theme.colors.surfaceElevated}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={theme.colors.brandPrimary}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={ring.interpolate({ inputRange: [0, 1], outputRange: [RING_LENGTH, 0] })}
            />
          </Svg>
          <Text variant="displayBalance" tabular style={{ lineHeight: 50 }}>
            7
          </Text>
          <Text variant="caption" style={{ color: theme.colors.brandPrimary, fontWeight: '700', letterSpacing: 1 }}>
            GÜN ÜCRETSİZ
          </Text>
        </View>
      </View>

      <View>
        <View style={{ position: 'absolute', top: 10, left: '16%', right: '16%', height: 4, borderRadius: 2, backgroundColor: theme.colors.border }}>
          <Animated.View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.brandPrimary,
              width: strip.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }}
          />
        </View>
        <Row>
          {TRIAL_DAYS.map((day, index) => (
            <Animated.View key={day.label} style={[fadeUp(staged[index], 8), { flex: 1, alignItems: 'center', gap: 6 }]}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 4,
                  borderColor: toneColor(day.tone),
                  backgroundColor: theme.colors.backgroundPrimary,
                }}
              />
              <Text variant="caption" style={{ fontWeight: '600' }}>
                {day.label}
              </Text>
              <Text variant="caption" color="textSecondary" style={{ textAlign: 'center', fontSize: 11 }}>
                {day.caption}
              </Text>
            </Animated.View>
          ))}
        </Row>
      </View>

      <Row style={{ flexWrap: 'wrap', gap: theme.spacing.xs }}>
        {UNLOCKS.map((item, index) => (
          <Animated.View key={item.label} style={[popIn(staged[TRIAL_DAYS.length + index]), { width: '48.5%' }]}>
            <Row
              gap="sm"
              align="center"
              style={{
                padding: 10,
                borderRadius: theme.radius.widget,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfacePrimary,
              }}
            >
              <Ionicons name={item.icon} size={24} color={theme.colors.brandPrimary} />
              <Stack style={{ flex: 1 }}>
                <Text variant="cardTitle" tabular numberOfLines={1}>
                  {item.value}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ fontSize: 11 }}>
                  {item.label}
                </Text>
              </Stack>
            </Row>
          </Animated.View>
        ))}
      </Row>

      <Animated.View style={fadeUp(staged[TRIAL_DAYS.length + UNLOCKS.length], 8)}>
        <Row
          gap="sm"
          align="center"
          style={{
            padding: 12,
            borderRadius: theme.radius.widget,
            borderWidth: 1,
            borderColor: withAlpha(theme.colors.success, 0.35),
            backgroundColor: withAlpha(theme.colors.success, 0.08),
          }}
        >
          <Ionicons name="shield-checkmark-outline" size={22} color={theme.colors.success} />
          <Text variant="caption" style={{ flex: 1 }}>
            Deneme bitmeden iptal edersen ücret ödemezsin.
          </Text>
        </Row>
      </Animated.View>
    </Stack>
  );
}
