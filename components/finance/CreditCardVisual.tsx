import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Row, Stack, Text } from '@/components/primitives';
import { BankLogo } from './BankLogo';
import type { Account } from '@/features/accounts/api';

export interface CreditCardVisualProps {
  account: Account;
}

// Fiziksel bir kredi kartını andıran görsel: banka logosu, maskelenmiş numara, kart
// sahibi ve kesim/son ödeme günü. Zemin bilerek her iki temada da sabit grafit
// (#1F2126) — gerçek kart uygulamalarında (Revolut/N26 vb.) kart yüzeyi tema değişse
// de koyu kalır; gradient kütüphanesi eklemeden aynı derinlik hissi katmanlı,
// yarı saydam "blob" View'larla taklit edilir (docs/08-tasarim-sistemi.md §12.5 —
// Graphite Finance: koyu grafit zemin + Saffron vurgu).
const CARD_SURFACE = '#1F2126';
const CARD_TEXT = '#F6F5F1';

export function CreditCardVisual({ account }: CreditCardVisualProps) {
  const theme = useTheme();
  const lastFour = account.card_last_four;

  return (
    <View
      style={{
        borderRadius: theme.radius.heroWidget,
        padding: theme.spacing.lg,
        backgroundColor: CARD_SURFACE,
        overflow: 'hidden',
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -50,
          right: -40,
          width: 160,
          height: 160,
          borderRadius: 80,
          backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: -70,
          left: -40,
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: withAlpha('#FFFFFF', 0.04),
        }}
      />

      <Stack gap="xl">
        <Row align="center">
          <BankLogo bankCode={account.bank_code} fallbackIcon="card-outline" size={40} />
          <View style={{ flex: 1 }} />
          <Ionicons
            name="wifi"
            size={22}
            color={withAlpha(CARD_TEXT, 0.5)}
            style={{ transform: [{ rotate: '90deg' }] }}
          />
        </Row>

        <Text
          tabular
          numberOfLines={1}
          style={{ color: CARD_TEXT, fontSize: 19, fontWeight: '600', letterSpacing: 3 }}
        >
          •••• •••• •••• {lastFour ?? '••••'}
        </Text>

        <Row align="flex-end">
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="caption" style={{ color: withAlpha(CARD_TEXT, 0.55), letterSpacing: 0.6 }}>
              KART SAHİBİ
            </Text>
            <Text variant="body" numberOfLines={1} style={{ color: CARD_TEXT, fontWeight: '600' }}>
              {account.name}
            </Text>
          </Stack>
          <Stack gap="xxs" align="flex-end">
            <Text variant="caption" style={{ color: withAlpha(CARD_TEXT, 0.55), letterSpacing: 0.6 }}>
              KESİM / SON ÖDEME
            </Text>
            <Text variant="body" tabular style={{ color: CARD_TEXT, fontWeight: '600' }}>
              {account.statement_day ?? '—'} / {account.payment_due_day ?? '—'}
            </Text>
          </Stack>
        </Row>
      </Stack>
    </View>
  );
}
