import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { BottomSheet, Button, Pressable, ScrollableTabs, Stack, Text } from '@/components/primitives';
import type { ReportPdfSections } from '@/features/reports/pdf';
import { t } from '@/i18n';

export type ExportFormat = 'pdf' | 'csv';

const SECTION_LABELS: { key: keyof ReportPdfSections; readonly label: string }[] = [
  { key: 'summary', get label() { return t('finance.export.sectionSummary'); } },
  { key: 'categories', get label() { return t('finance.export.sectionCategories'); } },
  { key: 'counterparties', get label() { return t('finance.export.sectionCounterparties'); } },
  { key: 'obligations', get label() { return t('finance.export.sectionObligations'); } },
  { key: 'accounts', get label() { return t('finance.export.sectionAccounts'); } },
];

export interface ReportExportSheetProps {
  visible: boolean;
  onClose: () => void;
  periodLabel: string;
  /** Ücretsiz planda yalnızca bu ay dışa aktarılabilir (plan_limits.unlimited_export). */
  allowed: boolean;
  busy: boolean;
  onExport: (format: ExportFormat, sections: ReportPdfSections) => void;
  onUpgrade: () => void;
}

// design RaporDisaAktar.html. CSV her zaman hareket listesidir (bölüm seçimi yalnızca PDF'te anlamlı).
export function ReportExportSheet({ visible, onClose, periodLabel, allowed, busy, onExport, onUpgrade }: ReportExportSheetProps) {
  const theme = useTheme();
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [sections, setSections] = useState<ReportPdfSections>({
    summary: true,
    categories: true,
    counterparties: true,
    obligations: true,
    accounts: true,
  });
  const noneSelected = format === 'pdf' && !Object.values(sections).some(Boolean);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('finance.export.title')}>
      <Stack gap="md">
        <Text variant="body" color="textSecondary">
          {t('finance.export.body')}
        </Text>

        <View
          style={{
            padding: theme.spacing.md,
            borderRadius: theme.radius.input,
            backgroundColor: theme.colors.backgroundPrimary,
            gap: 2,
          }}
        >
          <Text variant="label" color="textSecondary">
            {t('finance.export.period')}
          </Text>
          <Text variant="cardTitle">{periodLabel}</Text>
        </View>

        <Stack gap="xs">
          <Text variant="label" color="textSecondary">
            {t('finance.export.format')}
          </Text>
          <ScrollableTabs
            tabs={[
              { key: 'pdf', label: 'PDF' },
              { key: 'csv', label: 'CSV' },
            ]}
            activeKey={format}
            onChange={(k) => setFormat(k as ExportFormat)}
          />
        </Stack>

        {format === 'pdf' ? (
          <Stack gap="xxs">
            <Text variant="label" color="textSecondary">
              {t('finance.export.sections')}
            </Text>
            {SECTION_LABELS.map((s) => {
              const checked = sections[s.key];
              return (
                <Pressable
                  key={s.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  onPress={() => setSections((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                  style={{ minHeight: theme.touchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
                >
                  <Ionicons
                    name={checked ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={checked ? theme.colors.action : theme.colors.mutedControl}
                  />
                  <Text variant="cardTitle" style={{ fontWeight: '500' }}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </Stack>
        ) : (
          <Text variant="caption" color="textSecondary">
            {t('finance.export.csvHint')}
          </Text>
        )}

        {!allowed ? (
          <Pressable
            accessibilityRole="button"
            onPress={onUpgrade}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, minHeight: theme.touchTarget.minimum }}
          >
            <Text variant="label" style={{ color: theme.colors.attentionMarker }}>
              Plus
            </Text>
            <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
              {t('finance.export.freeLimit')}
            </Text>
          </Pressable>
        ) : null}

        <Button
          label={format === 'pdf' ? t('finance.export.createPdf') : t('finance.export.createCsv')}
          icon="document-outline"
          onPress={() => onExport(format, sections)}
          loading={busy}
          disabled={!allowed || noneSelected}
        />
      </Stack>
    </BottomSheet>
  );
}
