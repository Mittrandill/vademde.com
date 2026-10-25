import { Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Pressable, Stack, Text } from '@/components/primitives';
import {
  INSTRUMENT_STATUS_LABEL,
  instrumentStatusOf,
  markBounced,
  previewInstrumentBounce,
  setInstrumentStatus,
  type InstrumentBouncePreview,
} from '@/features/instruments/api';
import type { Obligation } from '@/features/obligations/api';
import { formatMinorAmount } from '@/utils/money';
import { showErrorAlert } from '@/utils/alerts';
import { localeDateFormatter } from '@/i18n/format';
import { t } from '@/i18n';

const dateFormatter = localeDateFormatter({ day: 'numeric', month: 'long', year: 'numeric' });

// design CekDetay.html: alınmış çek/senedin yolculuğu + "Ne yapmak istiyorsun?" eylemleri.
// Eylemler mevcut akışlara gider (ciro/tahsilat) ya da yalnızca durum etiketini değiştirir;
// karşılıksız işaretleme sunucuda atomik çalışır.
export function InstrumentLifecycle({ obligation }: { obligation: Obligation }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const received = obligation.direction === 'receivable';
  const status = instrumentStatusOf(obligation) ?? (!received && obligation.status !== 'iptal_edildi' ? 'portfoy' : null);

  const refresh = () => {
    void queryClient.invalidateQueries();
  };

  const statusMutation = useMutation({
    mutationFn: (next: 'portfoy' | 'tahsile_verildi') => setInstrumentStatus(obligation.id, next),
    onSuccess: refresh,
    onError: () => Alert.alert(t('finance.instrument.updateFailedTitle'), t('finance.instrument.updateFailedBody')),
  });
  const bouncedMutation = useMutation({
    mutationFn: (expected: InstrumentBouncePreview) => markBounced(obligation.id, expected),
    onSuccess: refresh,
    onError: (error) => { refresh(); showErrorAlert(error); },
    networkMode: 'always',
  });
  const previewMutation = useMutation({
    mutationFn: () => previewInstrumentBounce(obligation.id),
    onSuccess: (preview) => {
      if (preview.state === 'bounced') { refresh(); return; }
      const affected = preview.impacts.filter((o) => o.reopened_minor > 0)
        .map((o) => `${o.title}: ${formatMinorAmount(o.reopened_minor, o.currency_code)}`).join('\n');
      const preserved = preview.replacement_claim_minor > 0
        ? t('finance.instrument.preserved', { amount: formatMinorAmount(preview.replacement_claim_minor, preview.currency_code) }) : '';
      Alert.alert(t('finance.instrument.bounceTitle'),
        t('finance.instrument.bounceBody', {
          affected: affected ? t('finance.instrument.bounceAffected', { list: affected }) : '',
          preserved,
        }), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('finance.instrument.confirm'), style: 'destructive', onPress: () => bouncedMutation.mutate(preview) },
        ]);
    },
    onError: (error) => showErrorAlert(error), networkMode: 'always',
  });

  if (!status) return null;

  const open = status === 'portfoy' || status === 'tahsile_verildi';
  const label = obligation.document_type === 'senet' ? 'senet' : 'çek';

  const actions: { key: string; icon: keyof typeof Ionicons.glyphMap; title: string; text: string; onPress: () => void }[] =
    [];
  if (open && received) {
    actions.push({
      key: 'endorse',
      icon: 'swap-horizontal-outline',
      title: t('finance.instrument.endorse'),
      text: t('finance.instrument.endorseHint'),
      onPress: () => router.push({ pathname: '/payments/new', params: { endorseId: obligation.id } }),
    });
    actions.push(
      status === 'portfoy'
        ? {
            key: 'bank',
            icon: 'business-outline',
            title: t('finance.instrument.toBank'),
            text: t('finance.instrument.toBankHint'),
            onPress: () => statusMutation.mutate('tahsile_verildi'),
          }
        : {
            key: 'back',
            icon: 'arrow-undo-outline',
            title: t('finance.instrument.backToPortfolio'),
            text: t('finance.instrument.backToPortfolioHint'),
            onPress: () => statusMutation.mutate('portfoy'),
          }
    );
    actions.push({
      key: 'collect',
      icon: 'checkmark-circle-outline',
      title: t('finance.instrument.collected'),
      text: t('finance.instrument.collectedHint'),
      onPress: () => router.push({ pathname: '/payments/new', params: { obligationId: obligation.id } }),
    });
  }

  // Yolculuk: geçilen adım dolu, şu an vurgulu, sıradaki soluk.
  const stepIndex = status === 'portfoy' ? 1 : status === 'tahsile_verildi' || status === 'ciro_edildi' ? 2 : 3;
  const steps = [
    { title: received ? t('finance.instrument.received') : t('finance.instrument.given'), text: obligation.created_at ? dateFormatter.format(new Date(obligation.created_at)) : '' },
    {
      title: received ? INSTRUMENT_STATUS_LABEL.portfoy : t('finance.instrument.awaitingPayment'),
      text: obligation.due_date ? t('finance.instrument.dueOn', { date: dateFormatter.format(new Date(obligation.due_date)) }) : '',
    },
    {
      title: status === 'ciro_edildi' ? t('finance.instrument.endorsed') : status === 'tahsile_verildi' ? t('finance.instrument.atBank') : t('finance.instrument.endorseOrCollect'),
      text: status === 'portfoy' ? t('finance.instrument.notChosen') : '',
    },
    {
      title: status === 'karsiliksiz' ? t('finance.instrument.bounced') : t('finance.instrument.closed'),
      text: status === 'karsiliksiz' ? t('finance.instrument.unpaid') : '',
    },
  ];

  return (
    <Stack gap="lg">
      {actions.length > 0 ? (
        <Stack gap="xs">
          <Text variant="label" color="textSecondary">
            {t('finance.instrument.whatToDo')}
          </Text>
          <View style={{ borderRadius: theme.radius.widget, backgroundColor: theme.colors.surfacePrimary, overflow: 'hidden' }}>
            {actions.map((a, index) => (
              <Pressable
                key={a.key}
                accessibilityRole="button"
                onPress={a.onPress}
                disabled={statusMutation.isPending}
                style={{
                  minHeight: 60,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  paddingHorizontal: theme.spacing.md,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                <Ionicons name={a.icon} size={24} color={theme.colors.textPrimary} />
                <View style={{ flex: 1 }}>
                  <Text variant="cardTitle">{a.title}</Text>
                  <Text variant="caption" color="textSecondary">
                    {a.text}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
              </Pressable>
            ))}
          </View>
        </Stack>
      ) : null}

      {status !== 'karsiliksiz' && status !== 'tahsil_edildi' && status !== 'odendi' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => previewMutation.mutate()}
          disabled={bouncedMutation.isPending || previewMutation.isPending}
          style={{ minHeight: theme.touchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
        >
          <Ionicons name="close-circle-outline" size={20} color={theme.colors.danger} />
          <Text variant="cardTitle" style={{ color: theme.colors.danger, fontSize: 14 }}>
            {t('finance.instrument.bounceTitle')}
          </Text>
        </Pressable>
      ) : null}

      <Stack gap="xs">
        <Text variant="label" color="textSecondary">
          {label === 'senet' ? t('finance.instrument.noteJourney') : t('finance.instrument.chequeJourney')}
        </Text>
        {steps.map((step, index) => {
          const passed = index < stepIndex;
          const current = index === stepIndex;
          return (
            <View key={step.title + index} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  marginTop: 4,
                  backgroundColor: passed ? theme.colors.textPrimary : current ? theme.colors.payable : 'transparent',
                  borderWidth: passed || current ? 0 : 1.5,
                  borderColor: theme.colors.mutedControl,
                }}
              />
              <View style={{ flex: 1, paddingBottom: theme.spacing.xs }}>
                <Text variant="cardTitle" color={passed || current ? 'textPrimary' : 'textSecondary'}>
                  {step.title}
                </Text>
                {step.text ? (
                  <Text variant="caption" color="textSecondary">
                    {step.text}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </Stack>
    </Stack>
  );
}
