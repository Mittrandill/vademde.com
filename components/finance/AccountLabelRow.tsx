import { Row, Text } from '@/components/primitives';
import { AccountIcon } from './AccountIcon';
import { BANK_NAME } from '@/features/banks/banks';
import { ACCOUNT_TYPE_LABEL } from '@/features/accounts/accountTypes';


export interface AccountLabelRowProps {
  bankCode?: string | null;
  accountName?: string | null;
  accountType?: string | null;
  cardLastFour?: string | null;
  /** Yalnızca accountType === 'cash' olan hesaplarda ikon için kullanılır (bkz. AccountIcon). */
  currencyCode?: string | null;
}

// Hesap adının serbest metin olması ("Ziraat Bankası kartım" gibi) hareket listelerinde
// tutarsız görünüyordu — bankası bilinen hesaplarda artık küçük banka logosu + banka adı +
// hesap türü + (kredi kartıysa) son 4 hane biçiminde, hesabın kendi adından bağımsız
// standart bir kimlik satırı gösterilir. Banka bilinmiyorsa (Kasa/Cüzdan) hesap adına düşülür.
export function AccountLabelRow({ bankCode, accountName, accountType, cardLastFour, currencyCode }: AccountLabelRowProps) {
  const label = bankCode
    ? [
        BANK_NAME[bankCode] ?? accountName,
        accountType ? ACCOUNT_TYPE_LABEL[accountType] : null,
        cardLastFour ? `•••• ${cardLastFour}` : null,
      ]
        .filter(Boolean)
        .join(' ')
    : accountName;

  if (!label) return null;

  return (
    <Row gap="xxs" align="center" style={{ flexShrink: 1 }}>
      <AccountIcon bankCode={bankCode} accountType={accountType} currencyCode={currencyCode} size={16} />
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
    </Row>
  );
}
