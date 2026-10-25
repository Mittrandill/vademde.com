import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { BottomSheet, Button, GroupedRow, GroupedSection, GroupedToggleRow, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { WidgetPreview, WidgetStage, type WidgetKind } from '@/components/finance/WidgetPreview';
import { useWidgetPrefsStore } from '@/store/widgetPrefsStore';
import { t } from '@/i18n';

type WidgetInfo = {
  kind: WidgetKind;
  glyph: { w: number; h: number; round?: boolean; brand?: boolean };
};

// Başlık, alt başlık ve iOS widget galerisindeki boyut adı: i18n widgets.kinds.<kind>.
const titleOf = (info: WidgetInfo) => t(`widgets.kinds.${info.kind}.title`);

// Tuval WidgetGaleri — widget'lar iOS'un kendi ekleme ekranından eklenir (targets/widget).
const HOME_WIDGETS: WidgetInfo[] = [
  { kind: 'next', glyph: { w: 26, h: 26, brand: true } },
  { kind: 'week', glyph: { w: 26, h: 26 } },
  { kind: 'upcoming', glyph: { w: 40, h: 20 } },
  { kind: 'summary', glyph: { w: 36, h: 38 } },
];

const LOCK_WIDGETS: WidgetInfo[] = [
  { kind: 'lockDays', glyph: { w: 26, h: 26, round: true } },
  { kind: 'lockNext', glyph: { w: 40, h: 20 } },
  { kind: 'lockInline', glyph: { w: 40, h: 6 } },
  { kind: 'lockNet', glyph: { w: 26, h: 26, round: true } },
];

const LOCK_KINDS = new Set<WidgetKind>(LOCK_WIDGETS.map((w) => w.kind));

function addSteps(info: WidgetInfo): string[] {
  if (LOCK_KINDS.has(info.kind)) {
    return [
      t('widgets.steps.lock1'),
      info.kind === 'lockInline' ? t('widgets.steps.lock2Inline') : t('widgets.steps.lock2'),
      t('widgets.steps.lock3', { title: titleOf(info) }),
    ];
  }
  return [
    t('widgets.steps.home1'),
    t('widgets.steps.home2'),
    t('widgets.steps.home3', { size: t(`widgets.kinds.${info.kind}.size`), title: titleOf(info) }),
  ];
}

function WidgetRow({ info, onPress }: { info: WidgetInfo; onPress: () => void }) {
  const theme = useTheme();
  const { w, h, round, brand } = info.glyph;
  return (
    <GroupedRow
      leading={
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            backgroundColor: theme.colors.fill,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: w,
              height: h,
              borderRadius: round ? h / 2 : Math.min(6, h / 2),
              backgroundColor: brand ? theme.colors.action : theme.colors.textSecondary,
            }}
          />
        </View>
      }
      title={titleOf(info)}
      subtitle={t(`widgets.kinds.${info.kind}.subtitle`)}
      onPress={onPress}
    />
  );
}

export default function WidgetsScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const hideAmounts = useWidgetPrefsStore((s) => s.hideAmounts);
  const setHideAmounts = useWidgetPrefsStore((s) => s.setHideAmounts);
  const [selected, setSelected] = useState<WidgetInfo | null>(null);

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}>
        <ScreenHeader title={t('widgets.title')} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <Text color="textSecondary">
          {t('widgets.intro')}
        </Text>

        <GroupedSection title={t('widgets.home')}>
          {HOME_WIDGETS.map((info) => (
            <WidgetRow key={info.kind} info={info} onPress={() => setSelected(info)} />
          ))}
        </GroupedSection>

        <GroupedSection title={t('widgets.lock')}>
          {LOCK_WIDGETS.map((info) => (
            <WidgetRow key={info.kind} info={info} onPress={() => setSelected(info)} />
          ))}
        </GroupedSection>

        <GroupedSection>
          <GroupedToggleRow
            leading={<Ionicons name="eye-off-outline" size={20} color={theme.colors.textSecondary} />}
            title={t('widgets.hideAmounts')}
            value={hideAmounts}
            onValueChange={setHideAmounts}
          />
        </GroupedSection>

        <Text variant="caption" color="textSecondary">
          {t('widgets.footer')}
        </Text>
      </ScrollView>

      <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title={selected ? titleOf(selected) : undefined}>
        {selected ? (
          <View style={{ gap: theme.spacing.md }}>
            <WidgetStage lock={LOCK_KINDS.has(selected.kind)}>
              <WidgetPreview kind={selected.kind} />
            </WidgetStage>
            <Text variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>
              {t('widgets.samplePreview')}
            </Text>
            <View style={{ gap: theme.spacing.sm }}>
              {addSteps(selected).map((step, index) => (
                <View key={index} style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: theme.colors.fill,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700' }}>{index + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>{step}</Text>
                </View>
              ))}
            </View>
            <Button label={t('widgets.ok')} onPress={() => setSelected(null)} />
          </View>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}
