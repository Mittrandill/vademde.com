import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, Divider, Row, Stack, Text, TextField } from '@/components/primitives';
import { AuthHeader } from '@/components/brand/AuthHeader';
import { SocialSignInButtons } from '@/components/auth/SocialSignInButtons';
import { signInWithApple, signInWithGoogle, signUpWithPassword } from '@/features/auth/api';
import { translateAuthError } from '@/features/auth/errors';

export default function SignUpScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await signUpWithPassword(email.trim(), password);
      setConfirmationSent(true);
    } catch (err) {
      setError(translateAuthError(err, 'Kayıt oluşturulamadı'));
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    setError(null);
    setAppleLoading(true);
    try {
      await signInWithApple();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        setError(translateAuthError(err, 'Apple ile kayıt olunamadı'));
      }
    } finally {
      setAppleLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(translateAuthError(err, 'Google ile kayıt olunamadı'));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: theme.screenEdge.standard,
            paddingVertical: theme.spacing.xxl,
          }}
        >
          <Stack gap="xl">
            <AuthHeader markSize={48} />

            {confirmationSent ? (
              <Text variant="body" color="success">
                Bu e-posta adresi sistemde kayıtlı değilse, doğrulama bağlantısı gönderildi.
                Gelen kutunuzu kontrol edin.
              </Text>
            ) : (
              <>
                <SocialSignInButtons
                  onApplePress={handleApple}
                  onGooglePress={handleGoogle}
                  appleLoading={appleLoading}
                  googleLoading={googleLoading}
                  disabled={loading}
                />

                <Row gap="sm" align="center">
                  <Divider style={{ flex: 1 }} />
                  <Text variant="caption" color="textSecondary">
                    veya
                  </Text>
                  <Divider style={{ flex: 1 }} />
                </Row>

                <Stack gap="sm">
                  <TextField
                    placeholder="E-posta adresiniz"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                  />
                  <TextField
                    placeholder="Şifreniz"
                    secureTextEntry={!passwordVisible}
                    value={password}
                    onChangeText={setPassword}
                    rightIcon={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                    onRightIconPress={() => setPasswordVisible((v) => !v)}
                  />
                </Stack>

                {error ? (
                  <Text variant="caption" color="danger">
                    {error}
                  </Text>
                ) : null}

                <Button label="Kayıt Ol" onPress={handleSubmit} loading={loading} />
              </>
            )}

            <Link href="/(auth)/sign-in" style={{ alignSelf: 'center' }}>
              <Text variant="body" color="textSecondary">
                Zaten hesabınız var mı? <Text variant="body" color="brandPrimary">Giriş yapın</Text>
              </Text>
            </Link>
          </Stack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
