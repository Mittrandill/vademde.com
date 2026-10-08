import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

// HANDOFF §3 — tutamaçlı, karartmalı alt sheet (OdemeKaydet, KotaDoldu, HizliEkle, tarih seçiciler…).
// Kapalıyken mount edilmez (bkz. ActionSheet: her iOS Modal ayrı bir UIViewController açar).
export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable
          accessibilityLabel="Kapat"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
        />
        <View
          style={{
            backgroundColor: theme.colors.surfacePrimary,
            borderTopLeftRadius: theme.radius.heroWidget,
            borderTopRightRadius: theme.radius.heroWidget,
            paddingHorizontal: theme.screenEdge.standard,
            paddingTop: theme.spacing.xs,
            maxHeight: '90%',
          }}
        >
          <View
            accessibilityElementsHidden
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.mutedControl,
              opacity: 0.5,
              marginBottom: theme.spacing.sm,
            }}
          />
          {title ? (
            <Text variant="sectionTitle" style={{ marginBottom: theme.spacing.md }}>
              {title}
            </Text>
          ) : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.lg }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
