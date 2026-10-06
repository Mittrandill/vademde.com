import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from './Text';

export type TagTone = 'neutral' | 'success' | 'danger' | 'brand' | 'violet' | 'aqua';

// vademde.css .tag: 22 pt, 6 radius, 12 pt/600; tonlar hafif dolgu + koyu metin (--*-t).
export function Tag({ label, tone = 'neutral', large }: { label: string; tone?: TagTone; large?: boolean }) {
  const theme = useTheme();
  const { colors } = theme;
  const dark = theme.scheme === 'dark';
  const palette: Record<TagTone, { bg: string; fg: string }> = {
    neutral: { bg: colors.fill, fg: colors.textSecondary },
    success: { bg: 'rgba(82,206,150,0.16)', fg: colors.success },
    danger: { bg: 'rgba(255,98,92,0.14)', fg: colors.danger },
    brand: { bg: 'rgba(255,176,0,0.16)', fg: colors.attentionMarker },
    violet: { bg: dark ? 'rgba(107,77,255,0.22)' : 'rgba(107,77,255,0.10)', fg: colors.payable },
    aqua: { bg: 'rgba(134,221,235,0.22)', fg: dark ? colors.accentAqua : '#1B7C8C' },
  };
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        height: large ? 26 : 22,
        paddingHorizontal: large ? 10 : 7,
        borderRadius: theme.radius.tag,
        justifyContent: 'center',
        backgroundColor: palette[tone].bg,
      }}
    >
      <Text numberOfLines={1} style={{ fontSize: large ? 13 : 12, fontWeight: '600', color: palette[tone].fg }}>
        {label}
      </Text>
    </View>
  );
}
