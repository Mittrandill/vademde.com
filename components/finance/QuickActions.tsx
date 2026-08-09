import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';

import { useTheme } from '@/theme';
import { Pressable, Row, SectionHeader, Stack, Text } from '@/components/primitives';
import { useQuickActionsStore } from '@/store/quickActionsStore';

interface QuickActionDef {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  href: Href;
}

// Kullanıcının Ana Sayfa'daki Hızlı İşlemler satırına ekleyebileceği tüm olası
// aksiyonlar. Varsayılan seçim useQuickActionsStore.DEFAULT_QUICK_ACTION_IDS'te
// tanımlıdır (Yeni Hareket/Raporlar/Hesaplar) — kullanıcı "Düzenle" ile bu havuzdan
// dilediğini seçip sırasını değiştirebilir (bkz. QuickActionsEditSheet). Her aksiyon
// kendi rengini taşımaz (bkz. render: tek, tutarlı bir marka rengi kullanılır) —
// kullanıcı geri bildirimi: renk renk rozetler "hazır AI şablonu" gibi duruyordu.
const QUICK_ACTION_POOL: QuickActionDef[] = [
  { id: 'yeni-hareket', icon: 'add-circle-outline', label: 'Yeni Hareket', href: '/transactions/new' },
  { id: 'yeni-borc-alacak', icon: 'document-text-outline', label: 'Yeni Borç/Alacak', href: '/obligations/new' },
  { id: 'raporlar', icon: 'bar-chart-outline', label: 'Raporlar', href: '/reports' },
  { id: 'hesaplar', icon: 'wallet-outline', label: 'Hesaplar', href: '/accounts' },
  { id: 'kredi-kartlarim', icon: 'card-outline', label: 'Kredi Kartlarım', href: '/accounts/credit-cards' },
  { id: 'tara', icon: 'scan-outline', label: 'Tara', href: '/(tabs)/tara' },
  { id: 'kisiler', icon: 'people-outline', label: 'Kişiler', href: '/counterparties' },
  { id: 'kategoriler', icon: 'pricetags-outline', label: 'Kategoriler', href: '/categories' },
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

  return (
    <Stack gap="sm">
      <SectionHeader title="Hızlı İşlemler" actionLabel="Düzenle" onActionPress={() => setEditOpen(true)} />

      {actions.length === 0 ? (
        <Pressable onPress={() => setEditOpen(true)}>
          <Row
            gap="sm"
            align="center"
            style={{
              padding: theme.spacing.md,
              borderRadius: theme.radius.widget,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: theme.colors.border,
            }}
          >
            <Ionicons name="add-circle-outline" size={22} color={theme.colors.textSecondary} />
            <Text variant="body" color="textSecondary">
              Hızlı işlem eklemek için dokunun
            </Text>
          </Row>
        </Pressable>
      ) : (
        // Renkli rozet ızgarası yerine tek bir marka rengiyle çizilmiş, sade kapsül
        // satırı — ikon+etiket yan yana, tek düzey yüzey. Hepsi aynı tonda olduğu
        // için göz her seferinde yeniden "renk okuma" yapmıyor, tek bir bileşen ailesi
        // gibi okunuyor.
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Row gap="sm">
            {actions.map((action) => (
              <Pressable
                key={action.id}
                onPress={() => router.push(action.href)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                  height: 44,
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.surfacePrimary,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Ionicons name={action.icon} size={18} color={theme.colors.brandPrimary} />
                <Text variant="body" numberOfLines={1}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </Row>
        </ScrollView>
      )}

      <QuickActionsEditSheet visible={editOpen} onClose={() => setEditOpen(false)} />
    </Stack>
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
          accessibilityLabel="Kapat"
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
              Hızlı İşlemleri Düzenle
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color={theme.colors.textPrimary} />
            </Pressable>
          </Row>

          <ScrollView>
            <Stack gap="lg">
              <Stack gap="sm">
                <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
                  SEÇİLİ ({selected.length})
                </Text>
                {selected.length === 0 ? (
                  <Text variant="body" color="textSecondary">
                    Henüz hızlı işlem seçilmedi.
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
                        <Ionicons name={action.icon} size={20} color={theme.colors.brandPrimary} />
                        <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                          {action.label}
                        </Text>
                        <EditIconButton
                          icon="chevron-up"
                          disabled={index === 0}
                          onPress={() => move(index, -1)}
                          accessibilityLabel={`${action.label} yukarı taşı`}
                        />
                        <EditIconButton
                          icon="chevron-down"
                          disabled={index === selected.length - 1}
                          onPress={() => move(index, 1)}
                          accessibilityLabel={`${action.label} aşağı taşı`}
                        />
                        <EditIconButton
                          icon="close"
                          onPress={() => remove(action.id)}
                          accessibilityLabel={`${action.label} kaldır`}
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
                    DİĞER SEÇENEKLER
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
                          accessibilityLabel={`${action.label} ekle`}
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
