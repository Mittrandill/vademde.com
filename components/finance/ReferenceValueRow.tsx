import { Text } from '@/components/primitives';
import { convertToReferenceMinor, type ValueUnitRate } from '@/features/valueUnits/api';
import { formatMinorAmount } from '@/utils/money';

export function formatCacheAge(cachedAt: string): string {
  const hours = Math.round((Date.now() - new Date(cachedAt).getTime()) / (60 * 60 * 1000));
  if (hours < 1) return 'az önce';
  if (hours < 24) return `${hours} saat önce`;
  return `${Math.round(hours / 24)} gün önce`;
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
        Güncel TL karşılığı için kur bilgisi bulunamadı.
      </Text>
    );
  }

  return (
    <Text variant="caption" color="textSecondary">
      ≈ {formatMinorAmount(reference.amountMinor, 'TRY')} (güncel kur
      {reference.isStale ? `, ${formatCacheAge(reference.cachedAt)} güncellendi` : ''})
    </Text>
  );
}
