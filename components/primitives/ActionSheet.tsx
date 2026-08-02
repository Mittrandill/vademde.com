import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Row, Stack } from './Stack';
import { Text } from './Text';

export interface ActionSheetOption {
  key: string;
  label: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Silme gibi geri alınamaz aksiyonlar için — ikon ve etiket danger renginde çizilir. */
  danger?: boolean;
}

export interface ActionSheetProps {
  visible: boolean;
  title: string;
  options: ActionSheetOption[];
  onClose: () => void;
}

// Aksiyon seçimi için Alert.alert kullanılmaz: Alert bir uyarı kontrolüdür ve
// react-native-web'de tamamen no-op'tur (class Alert { static alert() {} }), yani
// web'de menü hiç açılmaz. Bu sheet her iki platformda da çalışır.
export function ActionSheet({ visible, title, options, onClose }: ActionSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel="Kapat"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
        />
        <View
          style={{
            backgroundColor: theme.colors.surfaceElevated,
            borderTopLeftRadius: theme.radius.heroWidget,
            borderTopRightRadius: theme.radius.heroWidget,
            padding: theme.screenEdge.standard,
            paddingBottom: insets.bottom + theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <Text variant="caption" color="textSecondary" style={{ letterSpacing: 0.6 }}>
            {title.toUpperCase()}
          </Text>

          <Stack gap="xs">
            {options.map((option) => {
              const tint = option.danger ? theme.colors.danger : theme.colors.brandPrimary;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    onClose();
                    option.onPress();
                  }}
                  style={{
                    backgroundColor: theme.colors.surfacePrimary,
                    borderRadius: theme.radius.widget,
                    padding: theme.spacing.md,
                  }}
                >
                  <Row gap="sm">
                    <Ionicons name={option.icon} size={22} color={tint} />
                    <Stack gap="xxs" style={{ flex: 1 }}>
                      <Text variant="cardTitle" style={option.danger ? { color: theme.colors.danger } : undefined}>
                        {option.label}
                      </Text>
                      {option.description ? (
                        <Text variant="caption" color="textSecondary">
                          {option.description}
                        </Text>
                      ) : null}
                    </Stack>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                  </Row>
                </Pressable>
              );
            })}
          </Stack>

          <Pressable
            onPress={onClose}
            style={{
              height: theme.controlHeight.segmented,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.widget,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text variant="body" color="textSecondary">
              Vazgeç
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
