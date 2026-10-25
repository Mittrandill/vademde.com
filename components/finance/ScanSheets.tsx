import { View } from 'react-native';

import { useTheme } from '@/theme';
import { BottomSheet, Button, SourceTag, Stack, Text } from '@/components/primitives';
import { MONTH_NAMES } from '@/components/primitives/MonthStepper';
import { t } from '@/i18n';

// KotaDoldu.html ve TaramaYardim.html — tara sekmesindeki iki bilgi sheet'i.

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
    <BottomSheet visible={visible} onClose={onClose} title={t('scan.quotaSheet.title')}>
      <Stack gap="md" style={{ paddingTop: theme.spacing.xs }}>
        <Text variant="body" color="textSecondary">
          {t('scan.quotaSheet.body', { month: MONTH_NAMES[next.getMonth()] })}
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
          <Text variant="body">{t('scan.quotaSheet.usage')}</Text>
          <Text variant="body" tabular>
            {used} / {quota}
          </Text>
        </View>
        <Button label={t('scan.quotaSheet.upgrade')} onPress={onUpgrade} />
        {onSaveDraft ? (
          <Button label={t('scan.quotaSheet.saveDraft')} variant="secondary" onPress={onSaveDraft} loading={draftSaving} />
        ) : null}
        <Button label={t('scan.manual')} variant="secondary" onPress={onManual} />
      </Stack>
    </BottomSheet>
  );
}

const STEPS = ['step1', 'step2', 'step3'] as const;

export function ScanHelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('scan.help.title')}>
      <Stack gap="md" style={{ paddingTop: theme.spacing.xs }}>
        {STEPS.map((step) => (
          <Stack key={step} gap="xxs">
            <Text variant="cardTitle">{t(`scan.help.${step}Title`)}</Text>
            <Text variant="body" color="textSecondary">
              {t(`scan.help.${step}Text`)}
            </Text>
          </Stack>
        ))}

        <Stack gap="xs">
          <Text variant="label" color="textSecondary">
            {t('scan.help.tagsTitle')}
          </Text>
          <LegendRow kind="document" text={t('scan.help.tagDocument')} />
          <LegendRow kind="matched" text={t('scan.help.tagMatched')} />
          <LegendRow kind="check" text={t('scan.help.tagCheck')} />
        </Stack>

        <Stack gap="xxs">
          <Text variant="label" color="textSecondary">
            {t('scan.help.supportedTitle')}
          </Text>
          <Text variant="body">{t('scan.help.supported')}</Text>
        </Stack>

        <Button label={t('scan.help.gotIt')} onPress={onClose} />
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
