import { useState } from 'react';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Divider, Pressable, ProgressRing, Row, Stack, Text } from '@/components/primitives';
import { Amount, type AmountDirection } from './Amount';

export interface BalanceHeroProps {
  totalBalanceMinor: number;
  monthNetMinor: number;
  monthIncomeMinor: number;
  monthExpenseMinor: number;
  receivableMinor: number;
  payableMinor: number;
  hidden: boolean;
  onToggleHidden: () => void;
}

const HIDDEN_MASK = '••••••';
const RING_SIZE = 112;
const RING_STROKE = 12;
const PAGE_COUNT = 2;

export function BalanceHero({
  totalBalanceMinor,
  monthNetMinor,
  monthIncomeMinor,
  monthExpenseMinor,
  receivableMinor,
  payableMinor,
  hidden,
  onToggleHidden,
}: BalanceHeroProps) {
  const theme = useTheme();
  const [pageWidth, setPageWidth] = useState(0);
  const [page, setPage] = useState(0);

  // Halka, toplam bakiyenin değil borç/alacak dengesinin görselidir: dolu kısım
  // alacağın toplam içindeki payı. Kayıt yoksa halka boş kalır.
  const directionalTotal = receivableMinor + payableMinor;
  const receivableShare = directionalTotal > 0 ? receivableMinor / directionalTotal : 0;

  const monthVolume = monthIncomeMinor + monthExpenseMinor;
  const monthShare = (value: number) => (monthVolume > 0 ? Math.abs(value) / monthVolume : 0);

  // onMomentumScrollEnd bazı cihaz/kaydırma hızlarında güvenilir ateşlenmiyordu (özellikle
  // Android'de pagingEnabled ScrollView'ın bilinen bir kusuru) — nokta göstergesi bu yüzden
  // hep ilk sayfada kalıyordu. Tek bir "bitiş" olayına güvenmek yerine kaydırma sırasında
  // sürekli (throttle'lı) takip edilir; gösterge her zaman gerçek konumu yansıtır.
  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!pageWidth) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    const clamped = Math.max(0, Math.min(PAGE_COUNT - 1, index));
    setPage((prev) => (prev === clamped ? prev : clamped));
  }

  return (
    <Card variant="hero" style={{ overflow: 'hidden' }}>
      <Stack gap="md">
        {/* Kart sabit genişlikte iki sayfa gösterir (Toplam Bakiye / Bu Ay Gelir-Gider),
            sağa kaydırarak geçilir — genişlik burada onLayout ile ölçülür ki kartın
            kendi iç padding'inden (theme.spacing.lg) bağımsız her zaman doğru olsun. */}
        <View onLayout={(event) => setPageWidth(event.nativeEvent.layout.width)}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            scrollEnabled={pageWidth > 0}
          >
            <View style={{ width: pageWidth || undefined }}>
              <BalancePage
                totalBalanceMinor={totalBalanceMinor}
                monthNetMinor={monthNetMinor}
                receivableMinor={receivableMinor}
                payableMinor={payableMinor}
                receivableShare={receivableShare}
                hidden={hidden}
                onToggleHidden={onToggleHidden}
              />
            </View>
            <View style={{ width: pageWidth || undefined }}>
              <MonthPage
                incomeMinor={monthIncomeMinor}
                expenseMinor={monthExpenseMinor}
                netMinor={monthNetMinor}
                share={monthShare}
                hidden={hidden}
              />
            </View>
          </ScrollView>
        </View>

        <Row gap="xs" style={{ justifyContent: 'center' }}>
          {Array.from({ length: PAGE_COUNT }, (_, index) => (
            <View
              key={index}
              style={{
                width: index === page ? 16 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: index === page ? theme.colors.brandPrimary : theme.colors.border,
              }}
            />
          ))}
        </Row>
      </Stack>
    </Card>
  );
}

interface BalancePageProps {
  totalBalanceMinor: number;
  monthNetMinor: number;
  receivableMinor: number;
  payableMinor: number;
  receivableShare: number;
  hidden: boolean;
  onToggleHidden: () => void;
}

function BalancePage({
  totalBalanceMinor,
  monthNetMinor,
  receivableMinor,
  payableMinor,
  receivableShare,
  hidden,
  onToggleHidden,
}: BalancePageProps) {
  const theme = useTheme();

  return (
    <Stack gap="md">
      <Row align="center">
        <Text variant="caption" color="textSecondary" style={{ flex: 1, letterSpacing: 0.6 }}>
          TOPLAM BAKİYE
        </Text>
        <Pressable
          onPress={onToggleHidden}
          hitSlop={12}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            // Kart artık diğerleriyle aynı yüzeyde; kontrast düşük kaldığı için
            // düğme zemini yerine kenarlıkla ayrışıyor.
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Ionicons
            name={hidden ? 'eye-off-outline' : 'eye-outline'}
            size={18}
            color={theme.colors.textSecondary}
          />
        </Pressable>
      </Row>

      <Row gap="md" align="center">
        <Stack gap="xs" style={{ flex: 1 }}>
          {hidden ? (
            <Text variant="displayAmount">{HIDDEN_MASK}</Text>
          ) : (
            <Amount
              amountMinor={totalBalanceMinor}
              variant="displayAmount"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            />
          )}
          <Row gap="xs">
            <Text variant="caption" color="textSecondary">
              Bu ay:
            </Text>
            {hidden ? (
              <Text variant="caption" color="textSecondary">
                {HIDDEN_MASK}
              </Text>
            ) : (
              <Amount
                amountMinor={Math.abs(monthNetMinor)}
                direction={monthNetMinor >= 0 ? 'income' : 'expense'}
                variant="caption"
              />
            )}
          </Row>
        </Stack>

        <ProgressRing
          size={RING_SIZE}
          strokeWidth={RING_STROKE}
          progress={receivableShare}
          color={theme.colors.brandPrimary}
          trackColor={withAlpha(theme.colors.brandPrimary, 0.18)}
          cap
        >
          <Stack gap="xxs" align="center">
            <Ionicons name="wallet-outline" size={24} color={theme.colors.textSecondary} />
            <Text variant="caption" color="textSecondary">
              Bakiye
            </Text>
          </Stack>
        </ProgressRing>
      </Row>

      <Divider />

      <Row>
        <LegendItem
          label="Alacak"
          dotColor={theme.colors.success}
          amountMinor={receivableMinor}
          direction="receivable"
          hidden={hidden}
        />
        <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.md }} />
        <LegendItem
          label="Borç"
          dotColor={theme.colors.textSecondary}
          amountMinor={payableMinor}
          direction="payable"
          hidden={hidden}
        />
      </Row>
    </Stack>
  );
}

interface MonthPageProps {
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  share: (value: number) => number;
  hidden: boolean;
}

// BalancePage ile BİREBİR aynı iskelet (etiket+rozet satırı, büyük tutar + halka satırı,
// ayraç, iki sütunlu özet satırı) — sayfalar arası kaydırırken kartın boyutu/hizası hiç
// oynamasın diye kasıtlı olarak kopyalanır (bkz. kullanıcı geri bildirimi: "o card
// boyutuna göre organize et"). Önceki sürümde burada üç küçük (56pt) halka vardı; kartın
// asıl boyutunu belirleyen BalancePage'deki tek büyük (112pt) halkayla eşleşmediği için
// bu sayfa gözle görülür şekilde daha kısa/boş duruyordu.
function MonthPage({ incomeMinor, expenseMinor, netMinor, share, hidden }: MonthPageProps) {
  const theme = useTheme();
  const isPositive = netMinor >= 0;

  return (
    <Stack gap="md">
      <Row align="center">
        <Text variant="caption" color="textSecondary" style={{ flex: 1, letterSpacing: 0.6 }}>
          BU AY
        </Text>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Ionicons name="stats-chart-outline" size={16} color={theme.colors.textSecondary} />
        </View>
      </Row>

      <Row gap="md" align="center">
        <Stack gap="xs" style={{ flex: 1 }}>
          {hidden ? (
            <Text variant="displayAmount">{HIDDEN_MASK}</Text>
          ) : (
            <Amount
              amountMinor={Math.abs(netMinor)}
              direction={isPositive ? 'income' : 'expense'}
              variant="displayAmount"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            />
          )}
          <Text variant="caption" color="textSecondary">
            Net
          </Text>
        </Stack>

        <ProgressRing
          size={RING_SIZE}
          strokeWidth={RING_STROKE}
          progress={share(incomeMinor)}
          color={theme.colors.brandPrimary}
          trackColor={withAlpha(theme.colors.brandPrimary, 0.18)}
          cap
        >
          <Stack gap="xxs" align="center">
            <Ionicons name="swap-vertical-outline" size={24} color={theme.colors.textSecondary} />
            <Text variant="caption" color="textSecondary">
              Dağılım
            </Text>
          </Stack>
        </ProgressRing>
      </Row>

      <Divider />

      <Row>
        <LegendItem
          label="Gelir"
          dotColor={theme.colors.success}
          amountMinor={incomeMinor}
          direction="income"
          hidden={hidden}
        />
        <Divider orientation="vertical" style={{ marginHorizontal: theme.spacing.md }} />
        <LegendItem
          label="Gider"
          dotColor={theme.colors.textSecondary}
          amountMinor={expenseMinor}
          direction="expense"
          hidden={hidden}
        />
      </Row>
    </Stack>
  );
}

interface LegendItemProps {
  label: string;
  dotColor: string;
  amountMinor: number;
  direction: AmountDirection;
  hidden: boolean;
}

function LegendItem({ label, dotColor, amountMinor, direction, hidden }: LegendItemProps) {
  return (
    <Stack gap="xxs" style={{ flex: 1 }}>
      <Row gap="xs">
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
      </Row>
      {hidden ? (
        <Text variant="cardTitle" color="textSecondary">
          {HIDDEN_MASK}
        </Text>
      ) : (
        <Amount
          amountMinor={amountMinor}
          direction={direction}
          variant="cardTitle"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        />
      )}
    </Stack>
  );
}
