import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';

import { useTheme } from '@/theme';
import { Button, Stack, Text, TextField } from '@/components/primitives';
import { signUpWithPassword } from '@/features/auth/api';

export default function SignUpScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await signUpWithPassword(email.trim(), password);
      setConfirmationSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt oluşturulamadı');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', paddingHorizontal: theme.screenEdge.standard }}
      >
        <Stack gap="xl">
          <Stack gap="xs">
            <Text variant="pageTitle">Hesap Oluştur</Text>
            <Text variant="body" color="textSecondary">
              Vademde'yi kullanmaya başlayın
            </Text>
          </Stack>

          {confirmationSent ? (
            <Text variant="body" color="success">
              Doğrulama e-postası gönderildi. Gelen kutunuzu kontrol edin.
            </Text>
          ) : (
            <>
              <Stack gap="sm">
                <TextField
                  placeholder="E-posta"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                <TextField
                  placeholder="Şifre"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
