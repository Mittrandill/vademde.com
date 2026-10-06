import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { Pressable, Text } from '@/components/primitives';

export interface ScreenHeaderAction {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
  /** Geriye dönük uyumluluk: tuvalde tüm sağ düğmeler aynı hafif dolgulu daire (.cbtn). */
  variant?: 'neutral' | 'accent';
}

export interface ScreenHeaderTextAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Vurgulu (600) metin: "Kaydet", "Düzenle", "Bitti". */
  bold?: boolean;
}

export interface ScreenHeaderProps {
  title: string;
  /** Varsayılan: chevron-back + router.back(). */
  left?: ScreenHeaderAction;
  /** Soldaki metin düğmesi ("Vazgeç"); `left`'in yerine geçer. */
  leftLabel?: ScreenHeaderTextAction;
  /** null/undefined ise sağda hiçbir şey render edilmez. */
  right?: ScreenHeaderAction | null;
  /** Sağdaki metin düğmesi ("Kaydet", "Düzenle"); `right`'ın yerine geçer. */
  rightLabel?: ScreenHeaderTextAction;
  /** true: başlık gezinme çubuğunun ortasında küçük (17 pt/600) gösterilir; false: altında büyük başlık. */
  inline?: boolean;
}

const DEFAULT_LEFT: ScreenHeaderAction = {
  icon: 'chevron-back',
  accessibilityLabel: 'Geri',
  onPress: () => router.back(),
};

// vademde.css .nav + .lt: 44 pt gezinme çubuğu (solda geri/vazgeç, sağda daire düğme ya da metin) ve altında
// 34 pt/700 büyük başlık. Ekranlar arası tekrarlanan başlığın tek kaynağı.
export function ScreenHeader({ title, left = DEFAULT_LEFT, leftLabel, right, rightLabel, inline }: ScreenHeaderProps) {
  const theme = useTheme();

  return (
    <View>
      <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {leftLabel ? <TextAction action={leftLabel} /> : <BackButton action={left} />}
        {inline ? (
          <Text
            numberOfLines={1}
            style={{ position: 'absolute', left: 80, right: 80, textAlign: 'center', fontSize: 17, fontWeight: '600' }}
          >
            {title}
          </Text>
        ) : null}
        {rightLabel ? <TextAction action={rightLabel} /> : right ? <CircleButton action={right} /> : <View style={{ width: 44 }} />}
      </View>
      {inline ? null : (
        <Text variant="pageTitle" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ marginTop: theme.spacing.xxs }}>
          {title}
        </Text>
      )}
    </View>
  );
}

function BackButton({ action }: { action: ScreenHeaderAction }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={action.accessibilityLabel}
      onPress={action.onPress}
      hitSlop={8}
      style={{ height: 44, minWidth: 44, alignItems: 'flex-start', justifyContent: 'center' }}
    >
      <Ionicons name={action.icon} size={action.icon === 'chevron-back' ? 26 : 24} color={theme.colors.textPrimary} />
    </Pressable>
  );
}

function CircleButton({ action }: { action: ScreenHeaderAction }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={action.accessibilityLabel}
      onPress={action.onPress}
      hitSlop={8}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.fill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={action.icon} size={18} color={theme.colors.textPrimary} />
    </Pressable>
  );
}

function TextAction({ action }: { action: ScreenHeaderTextAction }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={action.onPress}
      disabled={action.disabled}
      hitSlop={8}
      style={{ height: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text
        style={{
          fontSize: 17,
          fontWeight: action.bold ? '600' : '400',
          color: action.disabled ? theme.colors.mutedControl : theme.colors.textPrimary,
        }}
      >
        {action.label}
      </Text>
    </Pressable>
  );
}
