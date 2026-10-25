import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';

import { useTheme } from '@/theme';
import { BottomSheet, Pressable, Text } from '@/components/primitives';
import { useQuickAddStore } from '@/store/quickAddStore';
import { t } from '@/i18n';

interface QuickAddItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  href: Href;
}

// design HizliEkle.html — yalnızca mevcut rotalara yönlendirir; yeni veri mantığı yoktur.
const ITEMS: QuickAddItem[] = [
  { key: 'expense', icon: 'arrow-up-circle-outline', get label() { return t('finance.quickAdd.expense'); }, href: '/transactions/new?direction=expense' },
  { key: 'income', icon: 'arrow-down-circle-outline', get label() { return t('finance.quickAdd.income'); }, href: '/transactions/new?direction=income' },
  { key: 'transfer', icon: 'swap-horizontal-outline', get label() { return t('finance.quickAdd.transfer'); }, href: '/transactions/new?direction=transfer' },
  { key: 'obligation', icon: 'calendar-outline', get label() { return t('finance.quickAdd.obligation'); }, href: '/obligations/new' },
  { key: 'instrument', icon: 'document-text-outline', get label() { return t('finance.quickAdd.instrument'); }, href: '/obligations/new?type=cek' },
  // Tasarımda tek satır; ödeme yönü rota parametresiyle seçildiği için iki satıra bölündü.
  { key: 'payment', icon: 'checkmark-circle-outline', get label() { return t('finance.quickAdd.payment'); }, href: '/payments/new?direction=payable' },
  { key: 'collection', icon: 'checkmark-done-circle-outline', get label() { return t('finance.quickAdd.collection'); }, href: '/payments/new?direction=receivable' },
];

export function QuickAddSheet() {
  const theme = useTheme();
  const open = useQuickAddStore((s) => s.open);
  const hide = useQuickAddStore((s) => s.hide);

  const go = (href: Href) => {
    hide();
    router.push(href);
  };

  return (
    <BottomSheet visible={open} onClose={hide} title="Ne eklemek istiyorsun?">
      <View style={{ gap: theme.spacing.sm + 2 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => go('/(tabs)/tara')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: theme.spacing.md,
            borderRadius: theme.radius.widget,
            backgroundColor: theme.colors.action,
          }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(31,33,38,0.12)',
            }}
          >
            <Ionicons name="scan-outline" size={26} color={theme.colors.onAction} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="cardTitle" style={{ fontSize: 17, fontWeight: '700', color: theme.colors.onAction }}>
              {t('finance.quickAdd.scan')}
            </Text>
            <Text variant="caption" style={{ color: theme.colors.onAction }}>
              {t('finance.quickAdd.scanHint')}
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={theme.iconSize.xxl} color={theme.colors.onAction} />
        </Pressable>

        <View style={{ borderRadius: theme.radius.widget, backgroundColor: theme.colors.backgroundPrimary, overflow: 'hidden' }}>
          {ITEMS.map((item, index) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              onPress={() => go(item.href)}
              style={{
                minHeight: 54,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingHorizontal: theme.spacing.md,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <Ionicons name={item.icon} size={24} color={theme.colors.textPrimary} />
              <Text variant="cardTitle" style={{ flex: 1, fontWeight: '500' }}>
                {item.label}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={theme.colors.mutedControl} />
            </Pressable>
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}
