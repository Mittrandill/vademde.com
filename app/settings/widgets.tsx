import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { GroupedRow, GroupedSection, GroupedToggleRow, Text } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { useWidgetPrefsStore } from '@/store/widgetPrefsStore';

type WidgetInfo = { title: string; subtitle: string; glyph: { w: number; h: number; round?: boolean; brand?: boolean } };

// Tuval WidgetGaleri — widget'lar iOS'un kendi ekleme ekranından eklenir (targets/widget).
const HOME_WIDGETS: WidgetInfo[] = [
  { title: 'Sıradaki vade', subtitle: 'Küçük · en yakın kayıt ve kalan gün', glyph: { w: 26, h: 26, brand: true } },
  { title: 'Bu hafta', subtitle: 'Küçük · ödenecek ve tahsil edilecek', glyph: { w: 26, h: 26 } },
  { title: 'Yaklaşan vadeler', subtitle: 'Orta · 3 kayıt', glyph: { w: 40, h: 20 } },
  { title: 'Özet ve tarama', subtitle: 'Büyük · bakiye, 4 vade, Tara kısayolu', glyph: { w: 36, h: 38 } },
];

const LOCK_WIDGETS: WidgetInfo[] = [
  { title: 'Kalan gün', subtitle: 'Yuvarlak · sıradaki vadeye kaç gün kaldı', glyph: { w: 26, h: 26, round: true } },
  { title: 'Sıradaki vade', subtitle: 'Dikdörtgen · tutar ve kayıt adı', glyph: { w: 40, h: 20 } },
  { title: 'Bu ay net', subtitle: 'Yuvarlak · gelir − gider', glyph: { w: 26, h: 26, round: true } },
];

function WidgetRow({ info }: { info: WidgetInfo }) {
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
              borderRadius: round ? h / 2 : 6,
              backgroundColor: brand ? theme.colors.action : theme.colors.textSecondary,
            }}
          />
        </View>
      }
      title={info.title}
      subtitle={info.subtitle}
    />
  );
}

export default function WidgetsScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const hideAmounts = useWidgetPrefsStore((s) => s.hideAmounts);
  const setHideAmounts = useWidgetPrefsStore((s) => s.setHideAmounts);

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
          Ana ekrana ya da kilit ekranına ekleyin; tutarları gizleme ayarınıza uyar.
        </Text>

        <GroupedSection title="ANA EKRAN">
          {HOME_WIDGETS.map((info) => (
            <WidgetRow key={info.title} info={info} />
          ))}
        </GroupedSection>

        <GroupedSection title="KİLİT EKRANI">
          {LOCK_WIDGETS.map((info) => (
            <WidgetRow key={`lock-${info.title}`} info={info} />
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
          Eklemek için ana ekranda boş bir yere uzun basın, + düğmesinden Vademde’yi seçin. Kilit ekranı için
          kilit ekranına uzun basıp Özelleştir’i kullanın. Widget’lar yalnızca seçili çalışma alanının özetini
          gösterir.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
