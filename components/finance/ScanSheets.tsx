import { View } from 'react-native';

import { useTheme } from '@/theme';
import { BottomSheet, Button, SourceTag, Stack, Text } from '@/components/primitives';

// KotaDoldu.html ve TaramaYardim.html — tara sekmesindeki iki bilgi sheet'i.

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export interface QuotaSheetProps {
  visible: boolean;
  onClose: () => void;
  used: number;
  quota: number;
  onUpgrade: () => void;
  onManual: () => void;
  /** Verilirse "Belgeyi taslak olarak sakla" satırı çıkar. */
  onSaveDraft?: () => void;
  draftSaving?: boolean;
}

// Kota, takvim ayı bazında yenilenir (bkz. features/subscriptions/api.ts currentPeriodMonth).
export function QuotaExceededSheet({
  visible,
  onClose,
  used,
  quota,
  onUpgrade,
  onManual,
  onSaveDraft,
  draftSaving,
}: QuotaSheetProps) {
  const theme = useTheme();
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Bu ayki tarama hakkın doldu">
      <Stack gap="md" style={{ paddingTop: theme.spacing.xs }}>
        <Text variant="body" color="textSecondary">
          {`Kotan 1 ${MONTH_NAMES[next.getMonth()]}'da yenilenir. O zamana kadar belgeni kaybetmeden devam edebilirsin.`}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            minHeight: 48,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text variant="body">Belge tarama</Text>
          <Text variant="body" tabular>
            {used} / {quota}
          </Text>
        </View>
        <Button label="Plus ile daha fazla tara" onPress={onUpgrade} />
        {onSaveDraft ? (
          <Button label="Belgeyi taslak olarak sakla" variant="secondary" onPress={onSaveDraft} loading={draftSaving} />
        ) : null}
        <Button label="Elle gir" variant="secondary" onPress={onManual} />
      </Stack>
    </BottomSheet>
  );
}

const STEPS = [
  { title: '1 · Çek', text: 'Belgeyi düz bir zemine koy, kadraja sığdır. Çok sayfalıysa sayfa ekle.' },
  { title: '2 · Okunur', text: 'Türü otomatik algılanır; tutar, vade ve karşı taraf işaretlenir.' },
  { title: '3 · Sen onaylarsın', text: 'Her alanın nereden geldiğini görürsün, gerekirse düzeltirsin.' },
];

const SUPPORTED = ['Çek', 'Senet', 'Fatura', 'e-Arşiv karekodu', 'Dekont', 'Kredi ödeme planı', 'Kart ekstresi', 'Fiş'];

export function ScanHelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Belge tarama nasıl çalışır?">
      <Stack gap="md" style={{ paddingTop: theme.spacing.xs }}>
        {STEPS.map((step) => (
          <Stack key={step.title} gap="xxs">
            <Text variant="cardTitle">{step.title}</Text>
            <Text variant="body" color="textSecondary">
              {step.text}
            </Text>
          </Stack>
        ))}

        <Stack gap="xs">
          <Text variant="label" color="textSecondary">
            ETİKETLER NE ANLAMA GELİR?
          </Text>
          <LegendRow kind="document" text="Belgeden okundu" />
          <LegendRow kind="matched" text="Kayıtlı kişi veya hesapla eşleşti" />
          <LegendRow kind="check" text="Emin değiliz, bir bak" />
        </Stack>

        <Stack gap="xxs">
          <Text variant="label" color="textSecondary">
            DESTEKLENEN BELGELER
          </Text>
          <Text variant="body">{SUPPORTED.join(' · ')}</Text>
        </Stack>

        <Button label="Anladım" onPress={onClose} />
      </Stack>
    </BottomSheet>
  );
}

function LegendRow({ kind, text }: { kind: 'document' | 'matched' | 'check'; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <SourceTag kind={kind} />
      <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}
