import { Text } from '@/components/primitives';
import { convertToReferenceMinor, type ValueUnitRate } from '@/features/valueUnits/api';
import { formatMinorAmount } from '@/utils/money';
import { t } from '@/i18n';

export function formatCacheAge(cachedAt: string): string {
  const hours = Math.round((Date.now() - new Date(cachedAt).getTime()) / (60 * 60 * 1000));
  if (hours < 1) return t('finance.reference.justNow');
  if (hours < 24) return t('finance.reference.hoursAgo', { count: hours });
  return t('finance.reference.daysAgo', { count: Math.round(hours / 24) });
}

// docs/01-finansal-kayit-modeli.md §3.5 — TRY dışı bir kayıt (döviz/kıymetli maden)
// için güncel TL karşılığı, kalıcı saklanmadan her görüntülemede canlı kurdan hesaplanır.
// Borç/alacak detayı (app/obligations/[id].tsx) ve hesap detayı (app/accounts/[id].tsx)
// aynı satırı kullanır.
export function ReferenceValueRow({
  amountMinor,
  unitCode,
  rates,
  isLoading,
}: {
  amountMinor: number;
  unitCode: string;
  rates: ValueUnitRate[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) return null;

  const reference = rates ? convertToReferenceMinor(amountMinor, unitCode, rates) : null;
  if (!reference) {
    return (
      <Text variant="caption" color="textSecondary">
        {t('finance.reference.noRate')}
      </Text>
    );
  }

  return (
    <Text variant="caption" color="textSecondary">
      {t('finance.reference.approx', {
        amount: formatMinorAmount(reference.amountMinor, 'TRY'),
        stale: reference.isStale ? t('finance.reference.stale', { age: formatCacheAge(reference.cachedAt) }) : '',
      })}
    </Text>
  );
}
