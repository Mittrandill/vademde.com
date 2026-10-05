import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';

export interface ScrollableTab {
  key: string;
  label: string;
  count?: number;
}

export interface ScrollableTabsProps {
  tabs: ScrollableTab[];
  activeKey: string;
  onChange: (key: string) => void;
}

const FADE_WIDTH = 36;

// HANDOFF §3 — yatay kayar sekmeler; sekmeler asla kesilmez, taşma varsa sağda solma maskesi çıkar.
export function ScrollableTabs({ tabs, activeKey, onChange }: ScrollableTabsProps) {
  const theme = useTheme();
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [offset, setOffset] = useState(0);

  const overflowing = contentWidth > layoutWidth + 1;
  const atEnd = offset + layoutWidth >= contentWidth - 4;
  const showFade = overflowing && !atEnd;

  return (
    <View onLayout={(e) => setLayoutWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={(w) => setContentWidth(w)}
        onScroll={(e) => setOffset(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={32}
        contentContainerStyle={{ gap: theme.spacing.xs, paddingRight: theme.spacing.md }}
      >
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(tab.key)}
              style={{
                height: theme.touchTarget.minimum,
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radius.input,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
                backgroundColor: active ? theme.colors.action : theme.colors.surfacePrimary,
                borderWidth: active ? 0 : 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text
                variant="cardTitle"
                numberOfLines={1}
                style={{ color: active ? theme.colors.onAction : theme.colors.textPrimary }}
              >
                {tab.label}
              </Text>
              {tab.count !== undefined ? (
                <Text
                  variant="label"
                  style={{ color: active ? theme.colors.onAction : theme.colors.textSecondary }}
                >
                  {tab.count}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {showFade ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: FADE_WIDTH }}
        >
          <Svg width={FADE_WIDTH} height="100%">
            <Defs>
              <LinearGradient id="tabsFade" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={theme.colors.backgroundPrimary} stopOpacity={0} />
                <Stop offset="1" stopColor={theme.colors.backgroundPrimary} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={FADE_WIDTH} height="100%" fill="url(#tabsFade)" />
          </Svg>
        </View>
      ) : null}
    </View>
  );
}
