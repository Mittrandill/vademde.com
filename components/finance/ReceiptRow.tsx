import { Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Pressable, Row, Stack, Text } from '@/components/primitives';
import { Amount } from '@/components/finance/Amount';
import { openReceipt, type ReceiptArchiveItem } from '@/features/receipts/api';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });

interface ReceiptRowProps {
  item: ReceiptArchiveItem;
  /** Cari sayfasında karşı taraf zaten belli olduğundan tekrar yazılmaz. */
  hideCounterparty?: boolean;
}

// Belge arşivindeki ve cari sayfasındaki dekont satırı: dokununca dosya açılır (tek dokunuş),
// sağdaki bağlantı dekontun ait olduğu ödemenin bulunduğu borç/alacak detayına götürür.
export function ReceiptRow({ item, hideCounterparty }: ReceiptRowProps) {
  const theme = useTheme();
  const isPdf = item.mimeType === 'application/pdf';

  async function open() {
    try {
      await openReceipt(item.documentId);
    } catch {
      Alert.alert('Dekont açılamadı', 'Dosya bulunamadı ya da bağlantı kurulamadı.');
    }
  }

  const subline = [
    !hideCounterparty ? item.counterpartyName : null,
    dateFormatter.format(new Date(item.date)),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.title} dekontunu aç`} onPress={open}>
      <Card>
        <Row gap="sm" align="center">
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.radius.input,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: withAlpha(isPdf ? theme.colors.accentViolet : theme.colors.brandPrimary, 0.16),
            }}
          >
            <Ionicons
              name={isPdf ? 'document-text' : 'image'}
              size={20}
              color={isPdf ? theme.colors.accentViolet : theme.colors.brandPrimary}
            />
          </View>
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant="cardTitle" numberOfLines={1}>
              {item.title}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {subline}
            </Text>
          </Stack>
          {item.amountMinor !== null ? (
            <Amount amountMinor={item.amountMinor} currencyCode={item.currencyCode} variant="body" />
          ) : null}
          {item.obligationId ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ödemenin bağlı olduğu kayda git"
              hitSlop={10}
              onPress={() => router.push({ pathname: '/obligations/[id]', params: { id: item.obligationId as string } })}
            >
              <Ionicons name="link-outline" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          ) : null}
        </Row>
      </Card>
    </Pressable>
  );
}
