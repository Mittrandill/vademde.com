import type { ReactNode } from 'react';

import { Card, Divider, Stack, Text } from '@/components/primitives';
import { Amount } from './Amount';
import type { ValueUnitType } from '@/features/valueUnits/units';

export interface HeroStatCardProps {
  label: string;
  amountMinor: number;
  currencyCode?: string;
  /** docs/01-finansal-kayit-modeli.md §3.5 — 'kiymetli_maden' ise currencyCode ISO 4217
   * değil sabit değer birimi kodudur (bkz. Amount'taki aynı prop). */
  valueUnitType?: ValueUnitType;
  /** Tutarı kırmızı gösterir (ör. güncel bakiye negatif, kart borcu pozitif). */
  danger?: boolean;
  /** Büyük tutarın altında küçük ikincil satır (ör. "12 hesap"). */
  caption?: string;
  /** Label/tutar bloğundan önce, aralarına Divider konarak gösterilecek içerik (ör. logo + rozet satırı). */
  above?: ReactNode;
}

// Hesaplar/Kredi Kartları/Kişiler ekranlarındaki tek-değerli hero kartlarının (Card
// variant="hero" + büyük Amount) ortak iskeleti. Alacak/borç kırılımı veya ilerleme
// halkası gibi çok parçalı hero kartlar (obligations/index.tsx, counterparties/index.tsx,
// counterparties/[id].tsx) buraya zorlanmaz — kendi bileşik yapılarını korur.
export function HeroStatCard({ label, amountMinor, currencyCode, valueUnitType, danger, caption, above }: HeroStatCardProps) {
  return (
    <Card variant="hero">
      <Stack gap={above ? 'lg' : 'xs'}>
        {above ? (
          <>
            {above}
            <Divider />
          </>
        ) : null}
        <Stack gap="xxs">
          <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
            {label}
          </Text>
          <Amount
            amountMinor={amountMinor}
            currencyCode={currencyCode}
            valueUnitType={valueUnitType}
            variant="displayAmount"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            overdue={danger}
          />
          {caption ? (
            <Text variant="caption" color="textSecondary">
              {caption}
            </Text>
          ) : null}
        </Stack>
      </Stack>
    </Card>
  );
}
