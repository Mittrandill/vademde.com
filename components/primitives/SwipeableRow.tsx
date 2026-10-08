import { useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Pressable } from './Pressable';
import { Text } from './Text';

export interface SwipeAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  backgroundColor: string;
  color: string;
  onPress: () => void;
}

const ACTION_WIDTH = 76;
// Bir satır açıkken başka satır kaydırılırsa önceki kapanır (iOS Mail davranışı).
let openRow: { id: symbol; close: () => void } | null = null;

/** Açık satır varsa kapatır (ör. liste kaydırılmaya başlayınca). */
export function closeSwipeableRows() {
  openRow?.close();
  openRow = null;
}

// Tuval HareketlerKaydir: sola kaydırınca sağdaki eylemler (Düzenle, Sil), sağa kaydırınca soldaki
// eylemler (Ödendi, Ertele) görünür. Ek native paket gerektirmez (PanResponder + Animated); yatay
// hareket dikeyden belirgin büyük olmadıkça listenin dikey kaydırması bozulmaz.
export function SwipeableRow({
  children,
  leftActions = [],
  rightActions = [],
}: {
  children: ReactNode;
  /** Sağa kaydırınca solda açılan eylemler. */
  leftActions?: SwipeAction[];
  /** Sola kaydırınca sağda açılan eylemler. */
  rightActions?: SwipeAction[];
}) {
  const [translateX] = useState(() => new Animated.Value(0));
  const [rowId] = useState(() => Symbol('swipeable-row'));
  const offset = useRef(0);
  const leftWidth = leftActions.length * ACTION_WIDTH;
  const rightWidth = rightActions.length * ACTION_WIDTH;

  function animateTo(value: number) {
    offset.current = value;
    Animated.spring(translateX, { toValue: value, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
    if (value !== 0) {
      if (openRow && openRow.id !== rowId) openRow.close();
      openRow = { id: rowId, close };
    } else if (openRow?.id === rowId) {
      openRow = null;
    }
  }

  function close() {
    animateTo(0);
  }

  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        const next = Math.max(-rightWidth, Math.min(leftWidth, offset.current + g.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const position = offset.current + g.dx;
        if (position > leftWidth / 2 && leftWidth > 0) animateTo(leftWidth);
        else if (position < -rightWidth / 2 && rightWidth > 0) animateTo(-rightWidth);
        else animateTo(0);
      },
      onPanResponderTerminate: () => animateTo(offset.current),
    })
  );

  if (leftActions.length === 0 && rightActions.length === 0) return <>{children}</>;

  const renderAction = (action: SwipeAction) => (
    <Pressable
      key={action.key}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={() => {
        close();
        action.onPress();
      }}
      style={{ width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: action.backgroundColor }}
    >
      <Ionicons name={action.icon} size={19} color={action.color} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: action.color }}>{action.label}</Text>
    </Pressable>
  );

  return (
    <View style={{ overflow: 'hidden' }}>
      {/* Eylemler yalnızca o yöne kaydırılınca görünür; dinlenmede satır basılıp saydamlaşınca altı görünmez. */}
      <Animated.View
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, flexDirection: 'row', opacity: translateX.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }}
      >
        {leftActions.map(renderAction)}
      </Animated.View>
      <Animated.View
        style={{ position: 'absolute', top: 0, bottom: 0, right: 0, flexDirection: 'row', opacity: translateX.interpolate({ inputRange: [-1, 0], outputRange: [1, 0], extrapolate: 'clamp' }) }}
      >
        {rightActions.map(renderAction)}
      </Animated.View>
      <Animated.View {...responder.panHandlers} style={{ transform: [{ translateX }] }}>
        {children}
      </Animated.View>
    </View>
  );
}
