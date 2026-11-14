import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Group, GroupedRow, GroupedRowIcon, Tag, Text } from '@/components/primitives';
import { BankLogo } from '@/components/finance/BankLogo';
import { VademdeMark } from '@/components/brand/VademdeMark';
import { tabularNums } from '@/theme/typography';
import { t } from '@/i18n';

// Tanışma sahneleri: örnek veriyle çizilen sabit önizlemelerdir (gerçek veri okunmaz).
// Uygulamanın kendi bileşenleriyle (Group/GroupedRow/Tag, BankLogo) kurulur; böylece kullanıcı
// kayıttan önce uygulamanın gerçekte nasıl göründüğünü görür (docs/08-tasarim-sistemi.md).
export interface IntroSceneProps {
  active?: boolean;
  height: number;
}

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
      duration: 480,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [active, reduce, delay, value]);
  return value;
}

/** Aşağıdan hafifçe kayarak beliren blok. */
function Rise({ active, delay = 0, children }: { active?: boolean; delay?: number; children: ReactNode }) {
  const v = useEntrance(active, delay);
  return (
    <Animated.View
      style={{
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function SceneGlow({ height }: { height: number }) {
  const theme = useTheme();
  const strength = theme.scheme === 'dark' ? 0.2 : 0.14;
  return (
    <Svg style={{ position: 'absolute', left: 0, right: 0, top: 0 }} width="100%" height={height}>
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="42%" rx="62%" ry="40%">
          <Stop offset="0" stopColor={theme.colors.brandPrimary} stopOpacity={strength} />
          <Stop offset="1" stopColor={theme.colors.brandPrimary} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="glow2" cx="6%" cy="66%" rx="50%" ry="30%">
          <Stop offset="0" stopColor={theme.colors.accentViolet} stopOpacity={strength * 0.8} />
          <Stop offset="1" stopColor={theme.colors.accentViolet} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#glow)" />
      <Rect width="100%" height="100%" fill="url(#glow2)" />
    </Svg>
  );
}

function SceneFrame({ height, label, children }: { height: number; label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ height, justifyContent: 'center', paddingHorizontal: theme.screenEdge.standard + 4 }}
    >
      <SceneGlow height={height} />
      <View style={{ gap: 12 }}>{children}</View>
    </View>
  );
}

function Amount({ value, color }: { value: string; color?: string }) {
  const theme = useTheme();
  return (
    <Text style={[{ fontSize: 15, fontWeight: '600', color: color ?? theme.colors.textPrimary }, tabularNums]}>{value}</Text>
  );
}

// 1 — Belge okuma + onay: kamera çerçevesindeki belge, okunan alanlar ve "kontrol et" işareti.
export function ScanIntroScene({ active, height }: IntroSceneProps) {
  const theme = useTheme();
  const types = t('onboarding.scenes.docTypes').split(',');
  return (
    <SceneFrame height={height} label={t('onboarding.scenes.scanA11y')}>
      <Rise active={active}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            borderRadius: theme.radius.widget,
            backgroundColor: theme.colors.surfacePrimary,
          }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              backgroundColor: theme.colors.fill,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="scan-outline" size={28} color={theme.colors.brandPrimary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontWeight: '600' }}>{t('onboarding.scenes.receivedCheque')}</Text>
            <Text variant="caption" color="textSecondary">
              {t('onboarding.scenes.readInSeconds')}
            </Text>
          </View>
          <View style={{ alignSelf: 'center' }}>
            <Tag label={t('onboarding.scenes.confidence')} tone="success" />
          </View>
        </View>
      </Rise>
      <Rise active={active} delay={140}>
        <Group inset={16}>
          <GroupedRow
            title={t('onboarding.scenes.amount')}
            trailing={
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Amount value={t('onboarding.scenes.sampleAmount')} />
                <Tag label={t('onboarding.scenes.fromDocument')} tone="success" />
              </View>
            }
          />
          <GroupedRow
            title={t('onboarding.scenes.dueDate')}
            trailing={
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Amount value={t('onboarding.scenes.sampleDate')} />
                <Tag label={t('onboarding.scenes.checkThis')} tone="brand" />
              </View>
            }
          />
          <GroupedRow title={t('onboarding.scenes.drawer')} value={t('onboarding.scenes.sampleParty')} />
        </Group>
      </Rise>
      <Rise active={active} delay={280}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {types.map((type) => (
            <Tag key={type} label={type.trim()} />
          ))}
        </View>
      </Rise>
    </SceneFrame>
  );
}

// 2 — Sesle kayıt (Plus): söylenen cümle ve ondan doldurulan form.
export function VoiceIntroScene({ active, height }: IntroSceneProps) {
  const theme = useTheme();
  const bars = [10, 18, 28, 16, 24, 34, 20, 12, 26, 18, 30, 14, 22, 10];
  return (
    <SceneFrame height={height} label={t('onboarding.scenes.voiceA11y')}>
      <Rise active={active}>
        <View
          style={{
            alignSelf: 'flex-end',
            maxWidth: '88%',
            padding: 14,
            gap: 10,
            borderRadius: 20,
            borderBottomRightRadius: 6,
            backgroundColor: theme.colors.surfaceElevated,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 34 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                marginRight: 6,
                backgroundColor: theme.colors.brandPrimary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="mic" size={16} color={theme.colors.onAction} />
            </View>
            {bars.map((h, i) => (
              <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: theme.colors.textSecondary }} />
            ))}
          </View>
          <Text style={{ fontSize: 16, lineHeight: 21 }}>{t('onboarding.scenes.voiceSample')}</Text>
        </View>
      </Rise>
      <Rise active={active} delay={180}>
        <View style={{ alignItems: 'center' }}>
          <Ionicons name="arrow-down" size={18} color={theme.colors.textSecondary} />
        </View>
      </Rise>
      <Rise active={active} delay={300}>
        <Group>
          <GroupedRow
            leading={<GroupedRowIcon name="arrow-down-circle-outline" tone="success" />}
            title={t('onboarding.scenes.voiceParty')}
            subtitle={t('onboarding.scenes.voiceKind')}
            trailing={<Amount value={t('onboarding.scenes.voiceAmount')} color={theme.colors.receivable} />}
          />
          <GroupedRow
            leading={<GroupedRowIcon name="calendar-outline" tone="brandSoft" />}
            title={t('onboarding.scenes.dueDate')}
            value={t('onboarding.scenes.voiceDue')}
          />
        </Group>
      </Rise>
    </SceneFrame>
  );
}

// 3 — Vadeler: bildirim + yaklaşan ödemeler listesi (çek, kredi taksiti, kart son ödemesi).
export function DueIntroScene({ active, height }: IntroSceneProps) {
  const theme = useTheme();
  return (
    <SceneFrame height={height} label={t('onboarding.scenes.dueA11y')}>
      <Rise active={active}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            borderRadius: 22,
            backgroundColor: theme.colors.surfaceElevated,
          }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              backgroundColor: theme.colors.backgroundPrimary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <VademdeMark size={26} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', fontSize: 15 }}>{t('onboarding.scenes.chequeDueTomorrow')}</Text>
              <Text variant="caption" color="textSecondary">
                {t('onboarding.scenes.now')}
              </Text>
            </View>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {t('onboarding.scenes.notificationBody')}
            </Text>
          </View>
        </View>
      </Rise>
      <Rise active={active} delay={160}>
        <Group>
          <GroupedRow
            leading={<BankLogo bankCode="turkiye-garanti-bankasi" size={34} />}
            title={t('onboarding.scenes.dueCheque')}
            subtitle={t('onboarding.scenes.dueChequeSub')}
            trailing={
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Amount value={t('onboarding.scenes.sampleAmount')} />
                <Tag label={t('onboarding.scenes.tomorrow')} tone="violet" />
              </View>
            }
          />
          <GroupedRow
            leading={<BankLogo bankCode="akbank" size={34} />}
            title={t('onboarding.scenes.dueLoan')}
            subtitle={t('onboarding.scenes.dueLoanSub')}
            trailing={
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Amount value={t('onboarding.scenes.dueLoanAmount')} />
                <Tag label={t('onboarding.scenes.inThreeDays')} tone="violet" />
              </View>
            }
          />
          <GroupedRow
            leading={<BankLogo bankCode="turkiye-is-bankasi" size={34} />}
            title={t('onboarding.scenes.dueCard')}
            subtitle={t('onboarding.scenes.dueCardSub')}
            trailing={
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Amount value={t('onboarding.scenes.dueCardAmount')} />
                <Tag label={t('onboarding.scenes.dueCardDate')} />
              </View>
            }
          />
        </Group>
      </Rise>
    </SceneFrame>
  );
}

// 4 — Tüm tablo (ikonlar Daha Fazla menüsündekiyle aynı: wallet/card/home): net varlık, hesaplar/kartlar/varlıklar ve ekip paylaşımı.
export function WealthIntroScene({ active, height }: IntroSceneProps) {
  const theme = useTheme();
  return (
    <SceneFrame height={height} label={t('onboarding.scenes.wealthA11y')}>
      <Rise active={active}>
        <View style={{ padding: 18, gap: 4, borderRadius: theme.radius.widget, backgroundColor: theme.colors.surfacePrimary }}>
          <Text variant="caption" color="textSecondary">
            {t('onboarding.scenes.netWorth')}
          </Text>
          <Text style={[{ fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.9 }, tabularNums]}>
            {t('onboarding.scenes.netWorthAmount')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
            <Tag label={t('onboarding.scenes.personal')} tone="brand" />
            <Tag label={t('onboarding.scenes.business')} tone="violet" />
            <Tag label={t('onboarding.scenes.team')} tone="aqua" />
          </View>
        </View>
      </Rise>
      <Rise active={active} delay={160}>
        <Group>
          <GroupedRow
            leading={<GroupedRowIcon name="wallet" />}
            title={t('onboarding.scenes.accounts')}
            trailing={<Amount value={t('onboarding.scenes.accountsAmount')} />}
          />
          <GroupedRow
            leading={<GroupedRowIcon name="card" />}
            title={t('onboarding.scenes.cards')}
            trailing={<Amount value={t('onboarding.scenes.cardsAmount')} color={theme.colors.payable} />}
          />
          <GroupedRow
            leading={<GroupedRowIcon name="home" />}
            title={t('onboarding.scenes.assets')}
            subtitle={t('onboarding.scenes.assetsSub')}
            trailing={<Amount value={t('onboarding.scenes.assetsAmount')} />}
          />
        </Group>
      </Rise>
    </SceneFrame>
  );
}
