import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { SourceTag, Text } from '@/components/primitives';
import { VadeLine, type VadeLineDay } from '@/components/finance/VadeLine';

// design Karsilama / Onboarding2-4: dört sahne de örnek veriyle çizilen, sabit ve hafif illüstrasyonlardır
// (gerçek kullanıcı verisi okunmaz). Tutarlar ve isimler tasarımdaki örneklerdir.
export interface IntroSceneProps {
  active?: boolean;
}

function SceneFrame({ children, label }: { children: React.ReactNode; label: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        borderRadius: theme.radius.heroWidget,
        backgroundColor: theme.colors.surfacePrimary,
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
      }}
    >
      {children}
    </View>
  );
}

export function ScanIntroScene(_props: IntroSceneProps) {
  const theme = useTheme();
  return (
    <SceneFrame label="Çek fotoğrafından okunan alanlar: tutar 16.000 lira, vade 17 Ekim, Demir Tekstil">
      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
          gap: theme.spacing.xs,
          backgroundColor: theme.colors.backgroundPrimary,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="label" color="textSecondary">
            Çek
          </Text>
          <Text variant="label" color="textSecondary" tabular>
            No 0041829
          </Text>
        </View>
        <Text variant="displayAmount" tabular style={{ fontSize: 28 }}>
          16.000,00
        </Text>
        <Text variant="label" color="textSecondary" tabular style={{ textTransform: 'none' }}>
          17.10.2026
        </Text>
      </View>
      {[
        { label: 'Tutar', value: '₺16.000,00', tag: 'document' as const },
        { label: 'Vade', value: '17 Eki 2026', tag: 'document' as const },
        { label: 'Kimden', value: 'Demir Tekstil', tag: 'check' as const },
      ].map((row) => (
        <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Text variant="label" color="textSecondary">
              {row.label}
            </Text>
            <Text variant="cardTitle">{row.value}</Text>
          </View>
          <SourceTag kind={row.tag} />
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="checkmark-circle-outline" size={theme.iconSize.lg} color={theme.colors.receivable} />
        <Text variant="caption" color="textSecondary">
          3 alan okundu, 1'ini sen onayla
        </Text>
      </View>
    </SceneFrame>
  );
}

const DEMO_DAYS: VadeLineDay[] = Array.from({ length: 14 }, (_, i) => {
  const date = new Date(2026, 9, 9 + i);
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const payable = i === 3 ? 20_000_00 : i === 6 ? 8_000_00 : i === 10 ? 4_500_00 : 0;
  const receivable = i === 5 ? 2_000_00 : i === 9 ? 16_000_00 : 0;
  return { date: iso, payableMinor: payable, receivableMinor: receivable };
});

export function TimelineIntroScene(_props: IntroSceneProps) {
  return (
    <SceneFrame label="Ödenecekler üstte, tahsil edilecekler altta gösterilen vade hattı örneği">
      <VadeLine days={DEMO_DAYS} halfHeight={56} />
    </SceneFrame>
  );
}

export function NotificationsIntroScene(_props: IntroSceneProps) {
  const theme = useTheme();
  const items = [
    { icon: 'trending-down-outline' as const, time: 'Dün', title: 'Enpara eksiye düşebilir', text: '12 Eki · senet bakiyeyi aşıyor' },
    { icon: 'document-text-outline' as const, time: '08:30', title: 'Çek tahsil günü yaklaşıyor', text: 'Demir Tekstil · ₺16.000 · 17 Eki' },
    { icon: 'calendar-outline' as const, time: '09:00', title: 'Kira yarın vadesinde', text: 'Ev sahibi · ₺15.000' },
  ];
  return (
    <SceneFrame label="Vade, bakiye ve çek tahsil günü bildirim örnekleri">
      {items.map((n) => (
        <View
          key={n.title}
          style={{
            flexDirection: 'row',
            gap: theme.spacing.sm,
            padding: theme.spacing.sm + 2,
            borderRadius: 16,
            backgroundColor: theme.colors.backgroundPrimary,
          }}
        >
          <Ionicons name={n.icon} size={22} color={theme.colors.textPrimary} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="label" color="textSecondary">
                Vademde
              </Text>
              <Text variant="label" color="textSecondary" tabular style={{ textTransform: 'none' }}>
                {n.time}
              </Text>
            </View>
            <Text variant="cardTitle">{n.title}</Text>
            <Text variant="caption" color="textSecondary">
              {n.text}
            </Text>
          </View>
        </View>
      ))}
    </SceneFrame>
  );
}

export function WorkspacesIntroScene(_props: IntroSceneProps) {
  const theme = useTheme();
  const items = [
    { initials: 'KB', name: 'Kişisel Bütçe', sub: 'Yalnızca sen', role: 'Sahip' },
    { initials: 'OK', name: 'Ofis Kasası', sub: 'İşletme · 3 üye', role: 'Düzenleyici' },
  ];
  return (
    <SceneFrame label="Kişisel bütçe ve ofis kasası çalışma alanları, roller">
      {items.map((w) => (
        <View
          key={w.name}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            borderRadius: 16,
            backgroundColor: theme.colors.backgroundPrimary,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surfacePrimary,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text variant="cardTitle" mono>
              {w.initials}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="cardTitle">{w.name}</Text>
            <Text variant="caption" color="textSecondary">
              {w.sub}
            </Text>
          </View>
          <Text variant="label" color="textSecondary">
            {w.role}
          </Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="lock-closed-outline" size={theme.iconSize.lg} color={theme.colors.textSecondary} />
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
          Her çalışma alanının verisi ayrı tutulur; kimin ne gördüğünü sen belirlersin.
        </Text>
      </View>
    </SceneFrame>
  );
}
