import { Row, Text } from '@/components/primitives';
import { BankLogo } from './BankLogo';
import { BANK_NAME } from '@/features/banks/banks';

const TYPE_LABEL: Record<string, string> = {
  bank: 'Banka',
  credit_card: 'Kredi Kartı',
  cash: 'Kasa',
  wallet: 'Cüzdan',
};

export interface AccountLabelRowProps {
  bankCode?: string | null;
  accountName?: string | null;
  accountType?: string | null;
  cardLastFour?: string | null;
}

// Hesap adının serbest metin olması ("Ziraat Bankası kartım" gibi) hareket listelerinde
// tutarsız görünüyordu — bankası bilinen hesaplarda artık küçük banka logosu + banka adı +
// hesap türü + (kredi kartıysa) son 4 hane biçiminde, hesabın kendi adından bağımsız
// standart bir kimlik satırı gösterilir. Banka bilinmiyorsa (Kasa/Cüzdan) hesap adına düşülür.
export function AccountLabelRow({ bankCode, accountName, accountType, cardLastFour }: AccountLabelRowProps) {
  const label = bankCode
    ? [
        BANK_NAME[bankCode] ?? accountName,
        accountType ? TYPE_LABEL[accountType] : null,
        cardLastFour ? `•••• ${cardLastFour}` : null,
      ]
        .filter(Boolean)
        .join(' ')
    : accountName;

  if (!label) return null;

  return (
    <Row gap="xxs" align="center" style={{ flexShrink: 1 }}>
      {bankCode ? <BankLogo bankCode={bankCode} size={16} /> : null}
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
    </Row>
  );
}
