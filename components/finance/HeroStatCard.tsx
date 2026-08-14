import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Button, Card, Divider, Row, Stack, StatColumns, Text, type StatColumn } from '@/components/primitives';
import { Amount, type AmountDirection } from './Amount';
import type { ValueUnitType } from '@/features/valueUnits/units';

export interface HeroStatCardProps {
  /** Verilmezse üst satırda yalnızca ikon kutusu (varsa) gösterilir — bkz. counterparties/index.tsx,
   * burada tutar tek bir başlık değil StatColumns'taki Alacak/Borç kırılımıdır. */
  label?: string;
  amountMinor?: number;
  currencyCode?: string;
  /** docs/01-finansal-kayit-modeli.md §3.5 — 'kiymetli_maden' ise currencyCode ISO 4217
   * değil sabit değer birimi kodudur (bkz. Amount'taki aynı prop). */
  valueUnitType?: ValueUnitType;
  /** Tutarı kırmızı gösterir (ör. güncel bakiye negatif, kart borcu pozitif). direction ile birlikte kullanılmaz. */
  danger?: boolean;
  /** Ödenecek/alacak rengini Amount'un kendi COLOR eşlemesinden alır (ör. obligations/counterparties). */
  direction?: AmountDirection;
  /** Büyük tutarın altında küçük ikincil satır (ör. "12 hesap"). */
  caption?: string;
  /** Başlık tutarının altında, "Alacak: 1.234,56" gibi etiket + tutar satırı (obligations'taki
   * karşı yön özeti). caption ile aynı anda kullanılmaz. */
  secondary?: { label: string; amountMinor: number; direction?: AmountDirection };
  /** Label/tutar bloğundan önce, aralarına Divider konarak gösterilecek içerik (ör. logo + rozet satırı). */
  above?: ReactNode;
  /** Sağ üstte kare ikon kutusu — obligations/credit-cards/accounts/banks/counterparties liste
   * ekranlarındaki ortak hero kart ailesini oluşturan tek görsel imza. */
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  /** Yalnızca ilerleme oranı anlamlı olan ekranlarda (Kredilerim, Kredi Kartlarım) kullanılır. */
  progress?: { ratio: number };
  /** Divider'dan sonra StatColumns satırı (ör. Aktif/Toplam/Gecikmiş, Toplam Hesap, Alacak/Borç). */
  stats?: StatColumn[];
  /** StatColumns'tan sonra birincil aksiyon butonu (ör. "Yeni Kredi Ekle"). */
  action?: { label: string; onPress: () => void };
}

// Kredilerim, Kredi Kartlarım, Hesaplar, Bankalar ve Kişi/Firmalar liste ekranlarındaki
// hero kartının TEK ortak iskeleti: [başlık tutarı + ikon kutusu] → (ilerleme çubuğu) →
// Divider → StatColumns → (aksiyon butonu). Ekrana göre değişen yalnızca hangi bölümlerin
// prop olarak verildiğidir — beş ekran da bu bileşimi birebir aynı JSX'ten render eder,
// böylece kartlar birbirinden görsel olarak "kopuk" durmaz.
export function HeroStatCard({
  label,
  amountMinor,
  currencyCode,
  valueUnitType,
  danger,
  direction,
  caption,
  secondary,
  above,
  icon,
  iconColor,
  progress,
  stats,
  action,
}: HeroStatCardProps) {
  const theme = useTheme();
  const hasHeadline = label !== undefined && amountMinor !== undefined;
  const progressPercent = progress ? Math.max(0, Math.min(100, Math.round(progress.ratio * 100))) : 0;

  return (
    <Card variant="hero">
      <Stack gap="lg">
        {above ? (
          <>
            {above}
            <Divider />
          </>
        ) : null}

        <Row gap="md" align="center">
          {hasHeadline ? (
            <Stack gap="xxs" style={{ flex: 1 }}>
              <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.4 }}>
                {label}
              </Text>
              <Amount
                amountMinor={amountMinor as number}
                currencyCode={currencyCode}
                valueUnitType={valueUnitType}
                direction={direction}
                overdue={danger}
                variant="displayAmount"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.55}
              />
              {secondary ? (
                <Row gap="xs" align="center">
                  <Text variant="caption" color="textSecondary">
                    {secondary.label}
                  </Text>
                  <Amount amountMinor={secondary.amountMinor} direction={secondary.direction} variant="caption" />
                </Row>
              ) : caption ? (
                <Text variant="caption" color="textSecondary">
                  {caption}
                </Text>
              ) : null}
            </Stack>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {icon ? (
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: theme.radius.input,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: withAlpha(iconColor ?? theme.colors.brandPrimary, 0.16),
              }}
            >
              <Ionicons name={icon} size={24} color={iconColor ?? theme.colors.brandPrimary} />
            </View>
          ) : null}
        </Row>

        {progress ? (
          <Stack gap="xs">
            <Row align="center" style={{ justifyContent: 'space-between' }}>
              <Text variant="caption" color="textSecondary">
                İLERLEME ORANI
              </Text>
              <Text variant="caption" color="textSecondary" style={{ fontWeight: '600' }}>
                %{progressPercent}
              </Text>
            </Row>
            <View
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  borderRadius: 4,
                  backgroundColor: theme.colors.brandPrimary,
                }}
              />
            </View>
          </Stack>
        ) : null}

        {stats && stats.length > 0 ? (
          <>
            <Divider />
            <StatColumns columns={stats} />
          </>
        ) : null}

        {action ? <Button icon="add" label={action.label} onPress={action.onPress} /> : null}
      </Stack>
    </Card>
  );
}
