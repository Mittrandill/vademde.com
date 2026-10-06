import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, Divider, FieldGroup, Pressable, Row, Text, TextField } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { VademdeMark } from '@/components/brand/VademdeMark';
import { SocialSignInButtons } from '@/components/auth/SocialSignInButtons';
import {
  resetPasswordForEmail,
  signInWithApple,
  signInWithGoogle,
  signInWithPassword,
} from '@/features/auth/api';
import { translateAuthError } from '@/features/auth/errors';

export default function SignInScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await signInWithPassword(email.trim(), password);
    } catch (err) {
      setError(translateAuthError(err, 'Giriş yapılamadı'));
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    setError(null);
    setInfo(null);
    setAppleLoading(true);
    try {
      await signInWithApple();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        setError(translateAuthError(err, 'Apple ile giriş yapılamadı'));
      }
    } finally {
      setAppleLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setInfo(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(translateAuthError(err, 'Google ile giriş yapılamadı'));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Şifre sıfırlama bağlantısı için önce e-posta adresinizi girin.');
      return;
    }
    try {
      await resetPasswordForEmail(email.trim());
      setInfo('Şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.');
    } catch (err) {
      setError(translateAuthError(err, 'Bağlantı gönderilemedi'));
    }
  }

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: theme.screenEdge.standard, paddingBottom: theme.spacing.lg }}
        >
          <ScreenHeader title="" inline />

          <View style={{ marginTop: theme.spacing.sm, alignItems: 'flex-start', gap: theme.spacing.xs }}>
            <VademdeMark size={40} />
            <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.56, marginTop: theme.spacing.sm }}>
              Tekrar hoş geldiniz
            </Text>
            <Text color="textSecondary" style={{ fontSize: 15, lineHeight: 20 }}>
              Kayıtlarınız tüm cihazlarınızda eşitlenir.
            </Text>
          </View>

          <View style={{ marginTop: 28 }}>
            <SocialSignInButtons
              onApplePress={handleApple}
              onGooglePress={handleGoogle}
              appleLoading={appleLoading}
              googleLoading={googleLoading}
              disabled={loading}
            />
          </View>

          <Row gap="sm" align="center" style={{ marginTop: theme.spacing.xl }}>
            <Divider style={{ flex: 1 }} />
            <Text variant="caption" color="textSecondary">
              veya e-posta ile
            </Text>
            <Divider style={{ flex: 1 }} />
          </Row>

          <View style={{ marginTop: theme.spacing.md }}>
            <FieldGroup>
              <TextField
                label="E-posta"
                placeholder="ornek@eposta.com"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <TextField
                label="Şifre"
                placeholder="••••••••"
                secureTextEntry={!passwordVisible}
                value={password}
                onChangeText={setPassword}
                rightIcon={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                onRightIconPress={() => setPasswordVisible((v) => !v)}
              />
            </FieldGroup>
            <Pressable onPress={handleForgotPassword} style={{ alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '500' }}>Şifremi unuttum</Text>
            </Pressable>
          </View>

          {error ? (
            <Text variant="caption" color="danger">
              {error}
            </Text>
          ) : null}
          {info ? (
            <Text variant="caption" color="receivable">
              {info}
            </Text>
          ) : null}

          <View style={{ flex: 1, minHeight: theme.spacing.lg }} />

          <View style={{ gap: theme.spacing.xs }}>
            <Button label="Giriş yap" onPress={handleSubmit} loading={loading} />
            <Link href="/(auth)/sign-up" style={{ alignSelf: 'center', paddingVertical: 12 }}>
              <Text color="textSecondary">
                Hesabın yok mu? <Text style={{ fontWeight: '600' }}>Kayıt ol</Text>
              </Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
