import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';

// Tuval .toast: metin renginde dolgu, solda ikon, sağda marka renginde "Geri al".
export function UndoToast({
  visible,
  message,
  icon = 'trash',
  onUndo,
  bottom,
}: {
  visible: boolean;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onUndo: () => void;
  /** Ekranın altından uzaklık (sekme çubuğunun üstünde kalması için). */
  bottom: number;
}) {
  const theme = useTheme();
  if (!visible) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: theme.screenEdge.standard, right: theme.screenEdge.standard, bottom }}>
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: theme.colors.textPrimary,
          borderRadius: 14,
          paddingVertical: 12,
          paddingHorizontal: 14,
        }}
      >
        <Ionicons name={icon} size={18} color={theme.colors.backgroundPrimary} />
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: theme.colors.backgroundPrimary }}>{message}</Text>
        <Pressable accessibilityRole="button" onPress={onUndo} hitSlop={10}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.colors.brandPrimary }}>Geri al</Text>
        </Pressable>
      </View>
    </View>
  );
}
