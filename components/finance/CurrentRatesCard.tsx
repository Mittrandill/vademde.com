import { Card, Row, Stack, Text } from '@/components/primitives';
import { ValueUnitBadge } from './ValueUnitPicker';
import { formatCacheAge } from './ReferenceValueRow';
import { VALUE_UNITS, getValueUnit } from '@/features/valueUnits/units';
import { isRateStale, type ValueUnitRate } from '@/features/valueUnits/api';
import { formatMinorAmount } from '@/utils/money';

export interface CurrentRatesCardProps {
  rates: ValueUnitRate[];
  isLoading: boolean;
}

const UNIT_ORDER = new Map(VALUE_UNITS.map((unit, index) => [unit.code, index]));

// docs/01-finansal-kayit-modeli.md §3.5 — uygulama artık USD/EUR/gram altın gibi
// birimleri her yerde TL karşılığına çevirip gösteriyor, ama kullanıcı kaynak kuru
// (1 USD/1 gram altın kaç TL) hiçbir ekranda göremiyordu — Raporlar'daki bu kart o
// boşluğu kapatır. value_unit_rates'te satırı olmayan birim (ör. cumhuriyet_altini,
// henüz senkronize edilmiyor — bkz. supabase/functions/sync-market-rates) hiç gösterilmez.
export function CurrentRatesCard({ rates, isLoading }: CurrentRatesCardProps) {
  const sorted = [...rates].sort(
    (a, b) => (UNIT_ORDER.get(a.unit_code) ?? 99) - (UNIT_ORDER.get(b.unit_code) ?? 99)
  );

  return (
    <Card>
      <Stack gap="sm">
        <Text variant="sectionTitle">Güncel Kurlar</Text>
        {isLoading ? (
          <Text variant="body" color="textSecondary">
            Kurlar yükleniyor…
          </Text>
        ) : sorted.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Kur bilgisi bulunamadı.
          </Text>
        ) : (
          <Stack gap="xs">
            {sorted.map((rate) => {
              const unit = getValueUnit(rate.unit_code);
              const isStale = isRateStale(rate.cached_at);

              return (
                <Row key={rate.unit_code} gap="sm" align="center">
                  <ValueUnitBadge unitCode={rate.unit_code} size={36} />
                  <Stack gap="xxs" style={{ flex: 1 }}>
                    <Text variant="body">{unit.name}</Text>
                    {isStale ? (
                      <Text variant="caption" color="textSecondary">
                        {formatCacheAge(rate.cached_at)} güncellendi
                      </Text>
                    ) : null}
                  </Stack>
                  <Text variant="cardTitle" tabular>
                    {formatMinorAmount(rate.try_equivalent_minor, 'TRY')}
                  </Text>
                </Row>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
