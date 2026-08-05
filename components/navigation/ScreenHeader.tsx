import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Pressable, Row, Text } from '@/components/primitives';

export interface ScreenHeaderAction {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
  /** neutral = theme.colors.surfaceElevated zemin (varsayılan); accent = theme.colors.brandPrimary zemin (ör. "yeni ekle"). */
  variant?: 'neutral' | 'accent';
}

export interface ScreenHeaderProps {
  title: string;
  /** Varsayılan: chevron-back + router.back(). Geri gitme özel bir fallback gerektiriyorsa
      (ör. deep link'te canGoBack() === false), onPress'i çağıran ekran kendi geçirir. */
  left?: ScreenHeaderAction;
  /** null/undefined ise sağda hiçbir şey render edilmez. */
  right?: ScreenHeaderAction | null;
}

const DEFAULT_LEFT: ScreenHeaderAction = {
  icon: 'chevron-back',
  accessibilityLabel: 'Geri',
  onPress: () => router.back(),
};

// Ekranlar arası tekrarlanan geri/kapat + başlık + sağ aksiyon header'ının tek kaynağı.
export function ScreenHeader({ title, left = DEFAULT_LEFT, right }: ScreenHeaderProps) {
  const theme = useTheme();

  return (
    <Row align="center">
      <HeaderButton action={left} />
      <Text variant="pageTitle" style={{ flex: 1, marginLeft: theme.spacing.sm }} numberOfLines={1}>
        {title}
      </Text>
      {right ? <HeaderButton action={right} /> : null}
    </Row>
  );
}

function HeaderButton({ action }: { action: ScreenHeaderAction }) {
  const theme = useTheme();
  const accent = action.variant === 'accent';

  return (
    <Pressable
      accessibilityLabel={action.accessibilityLabel}
      onPress={action.onPress}
      hitSlop={8}
      style={{
        width: 44,
        height: 44,
        borderRadius: theme.radius.input,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: accent ? theme.colors.brandPrimary : theme.colors.surfaceElevated,
      }}
    >
      <Ionicons
        name={action.icon}
        size={accent ? 26 : 22}
        color={accent ? theme.colors.brandPrimaryText : theme.colors.textPrimary}
      />
    </Pressable>
  );
}
