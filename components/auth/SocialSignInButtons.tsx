import { ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { Pressable, Row, Stack, Text } from '@/components/primitives';
import { GoogleGlyph } from './GoogleGlyph';

export interface SocialSignInButtonsProps {
  onApplePress: () => void;
  onGooglePress: () => void;
  appleLoading?: boolean;
  googleLoading?: boolean;
  disabled?: boolean;
}

// docs/03-bilgi-mimarisi-ekranlar.md §5.2 — "Apple ile devam et ve e-posta ile giriş".
// Apple yalnızca iOS'ta native "Sign in with Apple" olarak sunulur (App Store yönergesi
// 4.8); Google her platformda Supabase'in tarayıcı tabanlı OAuth akışıyla çalışır.
export function SocialSignInButtons({
  onApplePress,
  onGooglePress,
  appleLoading,
  googleLoading,
  disabled,
}: SocialSignInButtonsProps) {
  const theme = useTheme();

  return (
    <Stack gap="sm">
      {Platform.OS === 'ios' ? (
        <Pressable
          onPress={onApplePress}
          disabled={disabled || appleLoading}
          style={{
            height: theme.buttonHeight.primary,
            borderRadius: theme.radius.input,
            backgroundColor: '#000000',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? theme.opacity.disabled : 1,
          }}
        >
          {appleLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Row gap="xs" align="center">
              <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
              <Text variant="cardTitle" style={{ color: '#FFFFFF' }}>
                Apple ile devam et
              </Text>
            </Row>
          )}
        </Pressable>
      ) : null}

      <Pressable
        onPress={onGooglePress}
        disabled={disabled || googleLoading}
        style={{
          height: theme.buttonHeight.primary,
          borderRadius: theme.radius.input,
          backgroundColor: theme.colors.surfaceElevated,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? theme.opacity.disabled : 1,
        }}
      >
        {googleLoading ? (
          <ActivityIndicator color={theme.colors.textPrimary} />
        ) : (
          <Row gap="xs" align="center">
            <GoogleGlyph size={18} />
            <Text variant="cardTitle" color="textPrimary">
              Google ile devam et
            </Text>
          </Row>
        )}
      </Pressable>
    </Stack>
  );
}
