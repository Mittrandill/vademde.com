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

type WidgetInfo = {
  kind: WidgetKind;
  title: string;
  subtitle: string;
  /** iOS widget galerisinde hangi boyutta bulunduğu. */
  size: string;
  glyph: { w: number; h: number; round?: boolean; brand?: boolean };
};

// Tuval WidgetGaleri — widget'lar iOS'un kendi ekleme ekranından eklenir (targets/widget).
const HOME_WIDGETS: WidgetInfo[] = [
  { kind: 'next', title: 'Sıradaki vade', subtitle: 'Küçük · en yakın kayıt ve kalan gün', size: 'küçük', glyph: { w: 26, h: 26, brand: true } },
  { kind: 'week', title: 'Bu hafta', subtitle: 'Küçük · ödenecek ve tahsil edilecek', size: 'küçük', glyph: { w: 26, h: 26 } },
  { kind: 'upcoming', title: 'Yaklaşan vadeler', subtitle: 'Orta · 3 kayıt', size: 'orta', glyph: { w: 40, h: 20 } },
  { kind: 'summary', title: 'Özet ve tarama', subtitle: 'Büyük · bakiye, 4 vade, Tara kısayolu', size: 'büyük', glyph: { w: 36, h: 38 } },
];

const LOCK_WIDGETS: WidgetInfo[] = [
  { kind: 'lockDays', title: 'Kalan gün', subtitle: 'Dairesel · sıradaki vadeye kaç gün kaldı', size: 'dairesel', glyph: { w: 26, h: 26, round: true } },
  { kind: 'lockNext', title: 'Sıradaki vade', subtitle: 'Dikdörtgen · tutar ve kayıt adı', size: 'dikdörtgen', glyph: { w: 40, h: 20 } },
  { kind: 'lockInline', title: 'Saatin üstünde', subtitle: 'Satır içi · “Çek yarın ₺48.250”', size: 'satır içi', glyph: { w: 40, h: 6 } },
  { kind: 'lockNet', title: 'Bu ay net', subtitle: 'Dairesel · gelir − gider', size: 'dairesel', glyph: { w: 26, h: 26, round: true } },
];

const LOCK_KINDS = new Set<WidgetKind>(LOCK_WIDGETS.map((w) => w.kind));

function addSteps(info: WidgetInfo): string[] {
  if (LOCK_KINDS.has(info.kind)) {
    return [
      'Kilit ekranına uzun basın, Özelleştir › Kilit Ekranı’na dokunun.',
      info.kind === 'lockInline'
        ? 'Saatin üstündeki tarih satırına dokunun.'
        : 'Saatin altındaki widget alanına dokunun.',
      `Listeden Vademde’yi bulun ve “${info.title}” widget’ını seçin.`,
    ];
  }
  return [
    'Ana ekranda boş bir yere uzun basın, sol üstteki Düzenle › Widget Ekle’ye dokunun.',
    'Aramaya “Vademde” yazıp uygulamayı seçin.',
    `Sayfaları kaydırarak ${info.size} boyuttaki “${info.title}” widget’ını bulun ve Widget Ekle’ye dokunun.`,
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
      title={info.title}
      subtitle={info.subtitle}
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
        <ScreenHeader title="Widget’lar" />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <Text color="textSecondary">
          Ana ekrana ya da kilit ekranına ekleyin; tutarları gizleme ayarınıza uyar. Nasıl ekleneceğini görmek
          için bir widget’a dokunun.
        </Text>

        <GroupedSection title="ANA EKRAN">
          {HOME_WIDGETS.map((info) => (
            <WidgetRow key={info.kind} info={info} onPress={() => setSelected(info)} />
          ))}
        </GroupedSection>

        <GroupedSection title="KİLİT EKRANI">
          {LOCK_WIDGETS.map((info) => (
            <WidgetRow key={info.kind} info={info} onPress={() => setSelected(info)} />
          ))}
        </GroupedSection>

        <GroupedSection>
          <GroupedToggleRow
            leading={<Ionicons name="eye-off-outline" size={20} color={theme.colors.textSecondary} />}
            title="Widget’ta tutarları gizle"
            value={hideAmounts}
            onValueChange={setHideAmounts}
          />
        </GroupedSection>

        <Text variant="caption" color="textSecondary">
          Widget’lar yalnızca seçili çalışma alanının özetini gösterir ve uygulamayı her açtığınızda güncellenir.
        </Text>
      </ScrollView>

      <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.title}>
        {selected ? (
          <View style={{ gap: theme.spacing.md }}>
            <WidgetStage lock={LOCK_KINDS.has(selected.kind)}>
              <WidgetPreview kind={selected.kind} />
            </WidgetStage>
            <Text variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>
              Örnek verilerle önizleme
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
            <Button label="Tamam" onPress={() => setSelected(null)} />
          </View>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}
