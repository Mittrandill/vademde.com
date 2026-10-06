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
  setInstrumentStatus,
} from '@/features/instruments/api';
import type { Obligation } from '@/features/obligations/api';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

// design CekDetay.html: alınmış çek/senedin yolculuğu + "Ne yapmak istiyorsun?" eylemleri.
// Eylemler mevcut akışlara gider (ciro/tahsilat) ya da yalnızca durum etiketini değiştirir;
// karşılıksız işaretleme sunucuda atomik çalışır.
export function InstrumentLifecycle({ obligation }: { obligation: Obligation }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const status = instrumentStatusOf(obligation);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [obligation.workspace_id, 'obligations'] });
    queryClient.invalidateQueries({ queryKey: ['obligation', obligation.id] });
  };

  const statusMutation = useMutation({
    mutationFn: (next: 'portfoy' | 'tahsile_verildi') => setInstrumentStatus(obligation.id, next),
    onSuccess: refresh,
    onError: () => Alert.alert('Güncellenemedi', 'Durum değiştirilemedi. Lütfen tekrar deneyin.'),
  });
  const bouncedMutation = useMutation({
    mutationFn: () => markBounced(obligation.id),
    onSuccess: refresh,
    onError: () => Alert.alert('İşlem yapılamadı', 'Karşılıksız olarak işaretlenemedi. Lütfen tekrar deneyin.'),
  });

  if (obligation.direction !== 'receivable' || !status) return null;

  const open = status === 'portfoy' || status === 'tahsile_verildi';
  const label = obligation.document_type === 'senet' ? 'senet' : 'çek';

  function confirmBounced() {
    const reopens =
      status === 'ciro_edildi'
        ? ` Ciro ile kapanan borç ve bu ${label} yeniden açılır.`
        : ` Bu ${label} açık kalır.`;
    Alert.alert('Karşılıksız olarak işaretle', `Bu işlem geri alınamaz.${reopens} Emin misiniz?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'İşaretle', style: 'destructive', onPress: () => bouncedMutation.mutate() },
    ]);
  }

  const actions: { key: string; icon: keyof typeof Ionicons.glyphMap; title: string; text: string; onPress: () => void }[] =
    [];
  if (open) {
    actions.push({
      key: 'endorse',
      icon: 'swap-horizontal-outline',
      title: 'Ciro et',
      text: 'Bir borca karşılık ver',
      onPress: () => router.push({ pathname: '/payments/new', params: { endorseId: obligation.id } }),
    });
    actions.push(
      status === 'portfoy'
        ? {
            key: 'bank',
            icon: 'business-outline',
            title: 'Tahsile ver',
            text: 'Bankaya teslim et',
            onPress: () => statusMutation.mutate('tahsile_verildi'),
          }
        : {
            key: 'back',
            icon: 'arrow-undo-outline',
            title: 'Portföye geri al',
            text: 'Tahsilden geri çek',
            onPress: () => statusMutation.mutate('portfoy'),
          }
    );
    actions.push({
      key: 'collect',
      icon: 'checkmark-circle-outline',
      title: 'Tahsil edildi',
      text: 'Hesaba geçti',
      onPress: () => router.push({ pathname: '/payments/new', params: { obligationId: obligation.id } }),
    });
  }

  // Yolculuk: geçilen adım dolu, şu an vurgulu, sıradaki soluk.
  const stepIndex = status === 'portfoy' ? 1 : status === 'tahsile_verildi' || status === 'ciro_edildi' ? 2 : 3;
  const steps = [
    { title: 'Alındı', text: obligation.created_at ? dateFormatter.format(new Date(obligation.created_at)) : '' },
    {
      title: INSTRUMENT_STATUS_LABEL.portfoy,
      text: obligation.due_date ? `Vade ${dateFormatter.format(new Date(obligation.due_date))}` : '',
    },
    {
      title: status === 'ciro_edildi' ? 'Ciro edildi' : status === 'tahsile_verildi' ? 'Tahsilde' : 'Ciro veya tahsil',
      text: status === 'portfoy' ? 'Henüz seçilmedi' : '',
    },
    {
      title: status === 'karsiliksiz' ? 'Karşılıksız' : 'Kapandı',
      text: status === 'karsiliksiz' ? 'Ödeme yapılmadı' : '',
    },
  ];

  return (
    <Stack gap="lg">
      {actions.length > 0 ? (
        <Stack gap="xs">
          <Text variant="label" color="textSecondary">
            Ne yapmak istiyorsun?
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

      {status !== 'karsiliksiz' && status !== 'tahsil_edildi' ? (
        <Pressable
          accessibilityRole="button"
          onPress={confirmBounced}
          disabled={bouncedMutation.isPending}
          style={{ minHeight: theme.touchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
        >
          <Ionicons name="close-circle-outline" size={20} color={theme.colors.danger} />
          <Text variant="cardTitle" style={{ color: theme.colors.danger, fontSize: 14 }}>
            Karşılıksız olarak işaretle
          </Text>
        </Pressable>
      ) : null}

      <Stack gap="xs">
        <Text variant="label" color="textSecondary">
          {label === 'senet' ? 'Senedin yolculuğu' : 'Çekin yolculuğu'}
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
