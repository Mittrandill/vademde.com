import { View } from 'react-native';

import { Stack, Text } from '@/components/primitives';
import { t } from '@/i18n';
import { formatPercent, localeNumberFormatter } from '@/i18n/format';
import type { CardStatementAnchor } from '@/utils/cardDebt';
import { estimateRemainingMinimumPayment } from '@/utils/cardMinimumPayment';
import { formatMinorAmount } from '@/utils/money';

const rateFormatter = localeNumberFormatter({ maximumFractionDigits: 2 });

export function CardMinimumPayment({
  rate,
  statement,
  currencyCode,
}: {
  rate: number | null | undefined;
  statement: CardStatementAnchor | null;
  currencyCode: string;
}) {
  const minimum = estimateRemainingMinimumPayment(statement, rate);
  return (
    <Stack gap="xxs">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
          {t('accounts.minimum.remainingEstimate')}
        </Text>
        {rate != null ? (
          <Text variant="caption" color="textSecondary">{formatPercent(rateFormatter.format(rate))}</Text>
        ) : null}
      </View>
      <Text tabular style={{ fontSize: 15, fontWeight: '600' }}>
        {minimum !== null
          ? formatMinorAmount(minimum, currencyCode)
          : !statement ? t('accounts.detail.noStatement') : t('accounts.minimum.rateMissing')}
      </Text>
      <Text variant="caption" color="textSecondary">
        {!statement
          ? t('accounts.minimum.statementRequired')
          : rate == null ? t('accounts.minimum.addRateHint') : t('accounts.minimum.estimateHint')}
      </Text>
    </Stack>
  );
}
