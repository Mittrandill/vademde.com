import { Fragment, type ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { useTheme } from '@/theme';
import { Card, Divider, ProgressRing, Row, Stack, Text } from '@/components/primitives';

export interface DetailHeroCardProps {
  /** Hero yüzeyi her zaman temanın nötr "elevated" tonundadır (docs §12.4) — varsayılan true. */
  elevated?: boolean;
  /** Aralarına otomatik Divider basılan bölümler. false/null/undefined olan bölümler atlanır. */
  sections: ReactNode[];
}

// obligations/[id], counterparties/[id], banks/[code], accounts/[id] (kredi kartı) ve
// transactions/[id] hero kartlarının ortak kabuğu: her ekran hangi bölümlerin
// bulunacağına kendi karar verir (identity, metrik, özet vb.), kabuk sadece bunları
// dizip aralarına ayraç koyar.
export function DetailHeroCard({ elevated = true, sections }: DetailHeroCardProps) {
  const visible = sections.filter(Boolean);

  return (
    <Card elevated={elevated} variant="hero">
      <Stack gap="lg">
        {visible.map((section, index) => (
          <Fragment key={index}>
            {section}
            {index < visible.length - 1 ? <Divider /> : null}
          </Fragment>
        ))}
      </Stack>
    </Card>
  );
}

export interface DetailIdentityRowProps {
  /** Zaten uygun boyuta (44px) ayarlanmış ikon/logo/avatar. */
  icon: ReactNode;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  /** 52x52 nötr daire zemini. transactions/[id] gibi ekranlarda kapatılır (false). */
  circleBackground?: boolean;
  titleNumberOfLines?: number;
}

export function DetailIdentityRow({
  icon,
  title,
  subtitle,
  badge,
  circleBackground = true,
  titleNumberOfLines = 2,
}: DetailIdentityRowProps) {
  const theme = useTheme();

  return (
    <Row gap="sm" align="center">
      {circleBackground ? (
        <Stack
          align="center"
          style={{
            width: 52,
            height: 52,
            borderRadius: theme.radius.input,
            backgroundColor: theme.colors.backgroundPrimary,
            justifyContent: 'center',
          }}
        >
          {icon}
        </Stack>
      ) : (
        icon
      )}
      <Stack gap="xxs" style={{ flex: 1 }}>
        <Text variant="cardTitle" numberOfLines={titleNumberOfLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </Stack>
      {badge ?? null}
    </Row>
  );
}

export interface DetailMetricRowRing {
  progress: number;
  color: string;
  trackColor: string;
  centerContent: ReactNode;
  size?: number;
  strokeWidth?: number;
}

export interface DetailMetricRowProps {
  label: string;
  value: ReactNode;
  valueStyle?: StyleProp<TextStyle>;
  /** Tutarın altında küçük ikincil satır (ör. counterparties/[id]'deki "Siz borçlusunuz"). */
  caption?: string;
  ring?: DetailMetricRowRing;
}

export function DetailMetricRow({ label, value, valueStyle, caption, ring }: DetailMetricRowProps) {
  return (
    <Row gap="md" align="center">
      <Stack gap="xxs" style={{ flex: 1 }}>
        <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
          {label}
        </Text>
        {typeof value === 'string' || typeof value === 'number' ? (
          <Text
            variant="displayAmount"
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            style={valueStyle}
          >
            {value}
          </Text>
        ) : (
          value
        )}
        {caption ? (
          <Text variant="caption" color="textSecondary">
            {caption}
          </Text>
        ) : null}
      </Stack>
      {ring ? (
        <ProgressRing
          size={ring.size ?? 88}
          strokeWidth={ring.strokeWidth ?? 10}
          progress={ring.progress}
          color={ring.color}
          trackColor={ring.trackColor}
          cap
        >
          {ring.centerContent}
        </ProgressRing>
      ) : null}
    </Row>
  );
}
