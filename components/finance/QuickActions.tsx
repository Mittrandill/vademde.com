import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';

import { useTheme } from '@/theme';
import { Pressable, Row, Stack, Text } from '@/components/primitives';
import { useQuickActionsStore } from '@/store/quickActionsStore';
import { t } from '@/i18n';

interface QuickActionDef {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  href: Href;
}

// Kullanıcının Ana Sayfa'daki Hızlı İşlemler satırına ekleyebileceği tüm olası
// aksiyonlar. Varsayılan seçim useQuickActionsStore.DEFAULT_QUICK_ACTION_IDS'te
// tanımlıdır (Yeni Hareket/Raporlar/Hesaplar) — kullanıcı "Düzenle" ile bu havuzdan
// dilediğini seçip sırasını değiştirebilir (bkz. QuickActionsEditSheet). Her aksiyon
// kendi rengini taşımaz (bkz. render: tek, tutarlı bir marka rengi kullanılır) —
// kullanıcı geri bildirimi: renk renk rozetler "hazır AI şablonu" gibi duruyordu.
const QUICK_ACTION_POOL: QuickActionDef[] = [
  { id: 'yeni-hareket', icon: 'add', get label() { return t('home.quickActions.newTransaction'); }, href: '/transactions/new' },
  { id: 'odeme', icon: 'checkmark', get label() { return t('home.quickActions.payment'); }, href: '/payments/new' },
  { id: 'transfer', icon: 'swap-horizontal', get label() { return t('home.quickActions.transfer'); }, href: '/transactions/new?direction=transfer' },
  { id: 'yeni-borc-alacak', icon: 'document-text-outline', get label() { return t('home.quickActions.newObligation'); }, href: '/obligations/new' },
  { id: 'raporlar', icon: 'bar-chart', get label() { return t('home.quickActions.reports'); }, href: '/reports' },
  { id: 'hesaplar', icon: 'wallet-outline', get label() { return t('home.quickActions.accounts'); }, href: '/accounts' },
  { id: 'kredi-kartlarim', icon: 'card-outline', get label() { return t('home.quickActions.creditCards'); }, href: '/accounts/credit-cards' },
  { id: 'tara', icon: 'scan-outline', get label() { return t('home.quickActions.scan'); }, href: '/(tabs)/tara' },
  { id: 'kisiler', icon: 'people-outline', get label() { return t('home.quickActions.contacts'); }, href: '/counterparties' },
  { id: 'kategoriler', icon: 'pricetags-outline', get label() { return t('home.quickActions.categories'); }, href: '/categories' },
];

const POOL_BY_ID = new Map(QUICK_ACTION_POOL.map((action) => [action.id, action]));

export function QuickActions() {
  const theme = useTheme();
  const actionIds = useQuickActionsStore((s) => s.actionIds);
  const [editOpen, setEditOpen] = useState(false);

  // Depolanan kimliklerden havuzda karşılığı olmayanlar (ör. eski bir sürümden kalan)
  // sessizce atlanır — bozuk bir kimlik satırı hiç çizmemek yeterlidir, kullanıcıya
  // hata göstermeye gerek yok.
  const actions = actionIds.map((id) => POOL_BY_ID.get(id)).filter((a): a is QuickActionDef => !!a);

  // vademde.css AnaSayfa: 4 sütun, 56 pt kart kutusu + 12 pt etiket. Uzun basış listeyi düzenler.
  return (
    <View>
      {actions.length === 0 ? (
        <Pressable onPress={() => setEditOpen(true)}>
          <Row
            gap="sm"
            align="center"
            style={{ padding: theme.spacing.md, borderRadius: theme.radius.widget, backgroundColor: theme.colors.fill }}
          >
            <Ionicons name="add-circle-outline" size={22} color={theme.colors.textSecondary} />
            <Text color="textSecondary">{t('home.quickActions.addHint')}</Text>
          </Row>
        </Pressable>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: theme.spacing.md }}>
          {actions.map((action) => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityHint={t('home.quickActions.editHint')}
              onPress={() => router.push(action.href)}
              onLongPress={() => setEditOpen(true)}
              style={{ width: '25%', alignItems: 'center', gap: 6 }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.surfacePrimary,
                }}
              >
                <Ionicons name={action.icon} size={24} color={theme.colors.textPrimary} />
              </View>
              <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', textAlign: 'center' }}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <QuickActionsEditSheet visible={editOpen} onClose={() => setEditOpen(false)} />
    </View>
  );
}

interface QuickActionsEditSheetProps {
  visible: boolean;
  onClose: () => void;
}

// Sürükle-bırak kütüphanesi eklemeden basit ve güvenilir bir düzenleme deneyimi:
// seçili aksiyonlar sırayla listelenir (yukarı/aşağı okla sıralanır, çarpıyla
// kaldırılır), seçili olmayanlar altta "ekle" düğmesiyle listelenir. Her değişiklik
// anında zustand store'a (ve oradan AsyncStorage'a) yazılır — ayrı bir "Kaydet"
// adımı yok, uygulamanın geri kalanındaki anlık-uygulama desenleriyle tutarlı
// (bkz. tema tercihi, bakiye gizleme).
function QuickActionsEditSheet({ visible, onClose }: QuickActionsEditSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const actionIds = useQuickActionsStore((s) => s.actionIds);
  const setActionIds = useQuickActionsStore((s) => s.setActionIds);

  // Kapalıyken hiç mount edilmez (bkz. ActionSheet/DateField'daki aynı not): iOS'ta
  // her Modal ayrı bir UIViewController açar.
  if (!visible) return null;

  const selected = actionIds.map((id) => POOL_BY_ID.get(id)).filter((a): a is QuickActionDef => !!a);
  const selectedIds = new Set(selected.map((a) => a.id));
  const available = QUICK_ACTION_POOL.filter((a) => !selectedIds.has(a.id));

  function move(index: number, direction: -1 | 1) {
    const next = [...actionIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setActionIds(next);
  }

  function remove(id: string) {
    setActionIds(actionIds.filter((existing) => existing !== id));
  }

  function add(id: string) {
    setActionIds([...actionIds, id]);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel={t('ui.close')}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
        />
        <View
          style={{
            backgroundColor: theme.colors.surfaceElevated,
            borderTopLeftRadius: theme.radius.heroWidget,
            borderTopRightRadius: theme.radius.heroWidget,
            padding: theme.screenEdge.standard,
            paddingBottom: insets.bottom + theme.spacing.lg,
            maxHeight: '80%',
          }}
        >
          <Row align="center" style={{ marginBottom: theme.spacing.md }}>
            <Text variant="pageTitle" style={{ flex: 1 }}>
              {t('home.quickActions.editTitle')}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
            </Pressable>
          </Row>

          <ScrollView>
            <Stack gap="lg">
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                  {t('home.quickActions.selected', { count: selected.length })}
                </Text>
                {selected.length === 0 ? (
                  <Text variant="body" color="textSecondary">
                    {t('home.quickActions.noneSelected')}
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {selected.map((action, index) => (
                      <Row
                        key={action.id}
                        gap="sm"
                        align="center"
                        style={{
                          padding: theme.spacing.sm,
                          borderRadius: theme.radius.widget,
                          backgroundColor: theme.colors.surfacePrimary,
                        }}
                      >
                        <Ionicons name={action.icon} size={20} color={theme.colors.textPrimary} />
                        <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                          {action.label}
                        </Text>
                        <EditIconButton
                          icon="chevron-up"
                          disabled={index === 0}
                          onPress={() => move(index, -1)}
                          accessibilityLabel={t('home.quickActions.moveUp', { label: action.label })}
                        />
                        <EditIconButton
                          icon="chevron-down"
                          disabled={index === selected.length - 1}
                          onPress={() => move(index, 1)}
                          accessibilityLabel={t('home.quickActions.moveDown', { label: action.label })}
                        />
                        <EditIconButton
                          icon="close"
                          onPress={() => remove(action.id)}
                          accessibilityLabel={t('home.quickActions.remove', { label: action.label })}
                          danger
                        />
                      </Row>
                    ))}
                  </Stack>
                )}
              </Stack>

              {available.length > 0 ? (
                <Stack gap="sm">
                  <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                    {t('home.quickActions.otherOptions')}
                  </Text>
                  <Stack gap="xs">
                    {available.map((action) => (
                      <Row
                        key={action.id}
                        gap="sm"
                        align="center"
                        style={{
                          padding: theme.spacing.sm,
                          borderRadius: theme.radius.widget,
                          backgroundColor: theme.colors.surfacePrimary,
                        }}
                      >
                        <Ionicons name={action.icon} size={20} color={theme.colors.textSecondary} />
                        <Text variant="body" color="textSecondary" style={{ flex: 1 }} numberOfLines={1}>
                          {action.label}
                        </Text>
                        <EditIconButton
                          icon="add"
                          onPress={() => add(action.id)}
                          accessibilityLabel={t('home.quickActions.add', { label: action.label })}
                          accent
                        />
                      </Row>
                    ))}
                  </Stack>
                </Stack>
              ) : null}
            </Stack>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function EditIconButton({
  icon,
  onPress,
  accessibilityLabel,
  disabled,
  danger,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  danger?: boolean;
  accent?: boolean;
}) {
  const theme = useTheme();
  const tint = disabled
    ? theme.colors.border
    : danger
      ? theme.colors.danger
      : accent
        ? theme.colors.brandPrimary
        : theme.colors.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={18} color={tint} />
    </Pressable>
  );
}
