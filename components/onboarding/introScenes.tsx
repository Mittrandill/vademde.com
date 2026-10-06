import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Text } from '@/components/primitives';
import { BankLogo } from '@/components/finance/BankLogo';
import { VademdeMark } from '@/components/brand/VademdeMark';

// Tuval Tanisma1–3: üç sahne de örnek veriyle çizilen sabit illüstrasyonlardır (gerçek veri okunmaz).
// Tutarlar ve isimler tasarımdaki örneklerdir.
export interface IntroSceneProps {
  active?: boolean;
}

const FRAME_HEIGHT = 400;

function SceneFrame({ children, label }: { children: React.ReactNode; label: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        height: FRAME_HEIGHT,
        borderRadius: 28,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfacePrimary,
        shadowColor: '#1F2126',
        shadowOpacity: theme.scheme === 'light' ? 0.06 : 0,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
      }}
    >
      {children}
    </View>
  );
}

// 1 · Belgeyi çekin: eğik çek görseli, ok ve oluşan kayıt satırı.
export function ScanIntroScene(_props: IntroSceneProps) {
  const theme = useTheme();
  return (
    <SceneFrame label="Çek fotoğrafından Kuzey Lojistik için 48.250 liralık bir kayıt oluşur">
      <View
        style={{
          position: 'absolute',
          left: 58,
          top: 40,
          width: 220,
          height: 150,
          borderRadius: 6,
          backgroundColor: '#FBFAF6',
          padding: 16,
          transform: [{ rotate: '-5deg' }],
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 10 },
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#1F2126' }}>AKBANK T.A.Ş.</Text>
          <Text style={{ fontSize: 8, color: '#6E6F66' }}>No 0047219</Text>
        </View>
        <View style={{ width: 120, height: 4, borderRadius: 2, backgroundColor: '#D6D4CB', marginTop: 16 }} />
        <View style={{ width: 90, height: 4, borderRadius: 2, backgroundColor: '#D6D4CB', marginTop: 7 }} />
        <View
          style={{
            marginTop: 16,
            paddingVertical: 6,
            paddingHorizontal: 7,
            borderRadius: 4,
            backgroundColor: 'rgba(255,176,0,0.18)',
            borderWidth: 2,
            borderColor: '#FFB000',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <View style={{ width: 80, height: 5, borderRadius: 2, backgroundColor: '#8F8D85' }} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#1F2126' }}>48.250,00</Text>
        </View>
      </View>

      <View style={{ position: 'absolute', left: 0, right: 0, top: 200, alignItems: 'center' }}>
        <Ionicons name="arrow-down" size={32} color={theme.colors.mutedControl} />
      </View>

      <View
        style={{
          position: 'absolute',
          left: 28,
          right: 28,
          bottom: 36,
          minHeight: 56,
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: 14,
          backgroundColor: theme.colors.backgroundPrimary,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <BankLogo bankCode="akbank" size={34} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontWeight: '600' }}>Verilen çek</Text>
          <Text variant="caption" color="textSecondary">
            Kuzey Lojistik · 6 Ekim
          </Text>
        </View>
        <Text tabular style={{ fontWeight: '600' }}>
          ₺48.250,00
        </Text>
      </View>
    </SceneFrame>
  );
}

// 2 · Her kaydı siz onaylarsınız: alan alan "belgeden" / "kontrol edin" etiketleri.
export function ConfirmIntroScene(_props: IntroSceneProps) {
  const theme = useTheme();
  const rows: { label: string; value: string; tag: string; check?: boolean; warn?: boolean }[] = [
    { label: 'Tutar', value: '₺48.250,00', tag: 'belgeden', check: true },
    { label: 'Vade tarihi', value: '14 Kasım 2026', tag: 'kontrol edin', warn: true },
    { label: 'Lehtar', value: 'Kuzey Lojistik Ltd. Şti.', tag: 'belgeden', check: true },
  ];
  return (
    <SceneFrame label="Okunan alanlar önce size gösterilir; emin olunmayan vade tarihi işaretlenir">
      <View style={{ flex: 1, justifyContent: 'center', padding: 28 }}>
        <View style={{ borderRadius: theme.radius.group, overflow: 'hidden', backgroundColor: theme.colors.backgroundPrimary }}>
          {rows.map((row, index) => (
            <View
              key={row.label}
              style={{
                minHeight: 60,
                paddingHorizontal: 16,
                paddingVertical: 11,
                justifyContent: 'center',
                gap: 2,
                backgroundColor: row.warn ? 'rgba(255,176,0,0.14)' : 'transparent',
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: theme.colors.separator,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text variant="caption" color="textSecondary" style={{ fontSize: 13 }}>
                  {row.label}
                </Text>
                <Ionicons
                  name={row.warn ? 'alert-circle' : 'checkmark'}
                  size={12}
                  color={row.warn ? theme.colors.attentionMarker : theme.colors.textSecondary}
                />
                <Text style={{ fontSize: 11, fontWeight: '600', color: row.warn ? theme.colors.attentionMarker : theme.colors.textSecondary }}>
                  {row.tag}
                </Text>
              </View>
              <Text style={{ fontSize: row.label === 'Tutar' ? 22 : 17, fontWeight: row.label === 'Tutar' ? '700' : '400' }}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
        <View
          style={{
            marginTop: 16,
            height: 46,
            borderRadius: 14,
            backgroundColor: theme.colors.brandPrimary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.onAction }}>Onayla ve kaydet</Text>
        </View>
      </View>
    </SceneFrame>
  );
}

const WEEKDAYS = ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'];

// 3 · Hiçbir vade sessizce geçmez: mini takvim + bildirim kartı.
export function DueIntroScene(_props: IntroSceneProps) {
  const theme = useTheme();
  const days = [
    ...Array<null>(3).fill(null),
    ...Array.from({ length: 18 }, (_, i) => i + 1),
  ];
  return (
    <SceneFrame label="Ekim takviminde vade günleri ve 'Çek vadesi yarın' bildirimi">
      <View style={{ padding: 24, paddingHorizontal: 26 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontWeight: '600' }}>Ekim</Text>
          <Text variant="caption" color="textSecondary">
            4 vade
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, rowGap: 6 }}>
          {WEEKDAYS.map((d, i) => (
            <Text key={`w${i}`} variant="caption" color="textSecondary" style={{ width: `${100 / 7}%`, textAlign: 'center' }}>
              {d}
            </Text>
          ))}
          {days.map((n, i) => {
            const today = n === 6;
            const overdue = n === 2;
            const receivable = n === 9;
            const strong = n === 12 || n === 15;
            return (
              <View key={`d${i}`} style={{ width: `${100 / 7}%`, alignItems: 'center' }}>
                {n ? (
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: today ? theme.colors.textPrimary : 'transparent',
                    }}
                  >
                    <Text
                      tabular
                      style={{
                        fontSize: 15,
                        fontWeight: today || overdue || receivable || strong ? '600' : '400',
                        color: today
                          ? theme.colors.backgroundPrimary
                          : overdue
                            ? theme.colors.danger
                            : receivable
                              ? theme.colors.success
                              : theme.colors.textPrimary,
                      }}
                    >
                      {n}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 24,
          padding: 12,
          borderRadius: 18,
          backgroundColor: theme.colors.backgroundPrimary,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 12 },
        }}
      >
        <VademdeMark size={38} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 15, fontWeight: '600' }}>Çek vadesi yarın</Text>
            <Text variant="caption" color="textSecondary">
              şimdi
            </Text>
          </View>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            Kuzey Lojistik · ₺48.250,00 · Akbank
          </Text>
        </View>
      </View>
    </SceneFrame>
  );
}
