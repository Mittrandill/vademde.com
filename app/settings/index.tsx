import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Pressable, Row, SegmentedControl, Stack, Text } from '@/components/primitives';
import { useSession } from '@/features/auth/useSession';
import { getMySubscription } from '@/features/subscriptions/api';
import { getMyProfile } from '@/features/profile/api';
import { queryKeys } from '@/services/queryKeys';
import { useThemePreferenceStore } from '@/store/themePreferenceStore';

const THEME_OPTIONS = [
  { key: 'system' as const, label: 'Sistem' },
  { key: 'light' as const, label: 'Açık' },
  { key: 'dark' as const, label: 'Koyu' },
];

// docs/10-abonelik-gelir-modeli.md — plan kodu -> görünen ad.
const PLAN_LABELS: Record<string, string> = {
  free: 'Ücretsiz',
  plus: 'Vademde Plus',
  isletme: 'Vademde İşletme',
};

function initialsFrom(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email?.trim() || '';
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toLocaleUpperCase('tr-TR');
  }
  return source.slice(0, 2).toLocaleUpperCase('tr-TR');
}

// Ayarlar artık uygulama tercihlerinin (görünüm) yaşadığı ve kimlik/abonelik gibi daha
// derin ekranlara (Profil, Abonelik) açılan bir hub — bu ekranların kendi içeriği artık
// burada değil, kendi ekranlarında (bkz. app/profile, app/subscription).
export default function SettingsScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const themePreference = useThemePreferenceStore((s) => s.themePreference);
  const setThemePreference = useThemePreferenceStore((s) => s.setThemePreference);

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.subscription(),
    queryFn: getMySubscription,
  });

  const profileQuery = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: getMyProfile,
  });

  const planCode = subscriptionQuery.data?.plan ?? 'free';
  const planLabel = PLAN_LABELS[planCode] ?? planCode;
  const email = session?.user?.email ?? null;
  const fullName = profileQuery.data?.full_name ?? null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <Row
        align="center"
        gap="sm"
        style={{ paddingHorizontal: theme.screenEdge.standard, paddingTop: theme.spacing.sm }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text variant="pageTitle">Ayarlar</Text>
      </Row>

      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <Card style={{ padding: 0 }}>
          <Pressable onPress={() => router.push('/profile')}>
            <Row gap="sm" style={{ padding: theme.spacing.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: withAlpha(theme.colors.brandPrimary, 0.16),
                }}
              >
                <Text variant="body" style={{ color: theme.colors.brandPrimary, fontWeight: '600' }}>
                  {initialsFrom(fullName, email)}
                </Text>
              </View>
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Text variant="cardTitle" numberOfLines={1}>
                  {fullName || 'Profilini tamamla'}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {email ?? '—'}
                </Text>
              </Stack>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </Row>
          </Pressable>
        </Card>

        <Card style={{ padding: 0 }}>
          <Pressable onPress={() => router.push('/subscription')}>
            <Row gap="sm" style={{ padding: theme.spacing.md }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: theme.radius.input,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: withAlpha(theme.colors.brandPrimary, 0.14),
                }}
              >
                <Ionicons name="sparkles-outline" size={20} color={theme.colors.brandPrimary} />
              </View>
              <Stack gap="xxs" style={{ flex: 1 }}>
                <Text variant="cardTitle" numberOfLines={1}>
                  Abonelik
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {planLabel}
                </Text>
              </Stack>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </Row>
          </Pressable>
        </Card>

        <Card>
          <Stack gap="sm">
            <Text variant="caption" color="textSecondary">
              GÖRÜNÜM
            </Text>
            <SegmentedControl options={THEME_OPTIONS} value={themePreference} onChange={setThemePreference} />
          </Stack>
        </Card>

        <Card style={{ padding: 0 }}>
          <Stack gap="xxs">
            <Pressable onPress={() => router.push('/categories')}>
              <Row style={{ justifyContent: 'space-between', padding: theme.spacing.md }}>
                <Text variant="body">Kategoriler</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
              </Row>
            </Pressable>
            <Pressable onPress={() => router.push('/counterparties')}>
              <Row style={{ justifyContent: 'space-between', padding: theme.spacing.md }}>
                <Text variant="body">Kişi / Firmalar</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
              </Row>
            </Pressable>
          </Stack>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
