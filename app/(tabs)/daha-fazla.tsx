import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/colors';
import { Card, Pressable, Row, SectionHeader, Stack, Text } from '@/components/primitives';
import { listAccounts } from '@/features/accounts/api';
import { getObligationTotalsByType } from '@/features/obligations/api';
import { DOCUMENT_TYPE_ICON, DOCUMENT_TYPE_LABEL } from '@/features/obligations/documentTypes';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { formatMinorAmount } from '@/utils/money';
import { queryKeys } from '@/services/queryKeys';

// Hub'da gösterilecek belge türleri. Tümü değil, günlük kullanımda sık geçenler —
// gerisine Hareketler'in belge türü filtresinden ulaşılır.
const PINNED_DOCUMENT_TYPES = ['kredi', 'kredi_karti_ekstresi', 'cek', 'senet', 'kira', 'fatura'];

export default function MoreScreen() {
  const theme = useTheme();
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const accountsQuery = useQuery({
    queryKey: activeWorkspaceId ? queryKeys.accounts(activeWorkspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const totalsQuery = useQuery({
    queryKey: activeWorkspaceId
      ? queryKeys.obligationTotalsByType(activeWorkspaceId)
      : ['obligation-type-totals', 'disabled'],
    queryFn: () => getObligationTotalsByType(activeWorkspaceId as string),
    enabled: !!activeWorkspaceId,
  });

  const totalsByType = totalsQuery.data;
  const accounts = accountsQuery.data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.screenEdge.standard,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.lg,
        }}
      >
        <Text variant="pageTitle">Daha Fazla</Text>

        <Stack gap="sm">
          <SectionHeader title="Kayıt Türleri" />
          <Row gap="sm" style={{ flexWrap: 'wrap' }}>
            {PINNED_DOCUMENT_TYPES.map((type) => {
              const totals = totalsByType?.[type];
              return (
                <HubTile
                  key={type}
                  icon={DOCUMENT_TYPE_ICON[type] ?? 'document-outline'}
                  label={DOCUMENT_TYPE_LABEL[type] ?? type}
                  detail={totals ? `${totals.count} kayıt · ${formatMinorAmount(totals.totalMinor)}` : 'Kayıt yok'}
                  accent={theme.colors.accentViolet}
                  href={{ pathname: '/obligations', params: { type } }}
                />
              );
            })}
          </Row>
        </Stack>

        <Stack gap="sm">
          <SectionHeader title="Yönetim" />
          <Row gap="sm" style={{ flexWrap: 'wrap' }}>
            <HubTile
              icon="wallet-outline"
              label="Hesaplar"
              detail={accounts.length > 0 ? `${accounts.length} hesap` : 'Hesap yok'}
              accent={theme.colors.success}
              href="/accounts"
            />
            <HubTile
              icon="people-outline"
              label="Kişiler"
              detail="Kişi ve firmalar"
              accent={theme.colors.success}
              href="/counterparties"
            />
            <HubTile
              icon="pricetags-outline"
              label="Kategoriler"
              detail="Gelir ve gider"
              accent={theme.colors.success}
              href="/categories"
            />
            <HubTile
              icon="settings-outline"
              label="Ayarlar"
              detail="Hesap ve tercihler"
              accent={theme.colors.textSecondary}
              href="/settings"
            />
          </Row>
        </Stack>
      </ScrollView>
    </SafeAreaView>
  );
}

interface HubTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  accent: string;
  href: Href;
}

function HubTile({ icon, label, detail, accent, href }: HubTileProps) {
  const theme = useTheme();

  return (
    // Grid: minWidth satır başına kaç kutu sığacağını belirler (dar telefonda 2),
    // flex:1 ile aynı satırdakiler kalan genişliği eşit paylaşır.
    <Pressable onPress={() => router.push(href)} style={{ flex: 1, minWidth: 140 }}>
      <Card>
        <Stack gap="sm">
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.radius.input,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: withAlpha(accent, 0.14),
            }}
          >
            <Ionicons name={icon} size={20} color={accent} />
          </View>
          <Stack gap="xxs">
            <Text variant="cardTitle" numberOfLines={1}>
              {label}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {detail}
            </Text>
          </Stack>
        </Stack>
      </Card>
    </Pressable>
  );
}
