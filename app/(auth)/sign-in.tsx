import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';

import { useTheme } from '@/theme';
import { Button, Stack, Text, TextField } from '@/components/primitives';
import { signInWithPassword } from '@/features/auth/api';

export default function SignInScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await signInWithPassword(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş yapılamadı');
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
            <Text variant="pageTitle">Vademde</Text>
            <Text variant="body" color="textSecondary">
              Hesabınıza giriş yapın
            </Text>
          </Stack>

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

          <Button label="Giriş Yap" onPress={handleSubmit} loading={loading} />

          <Link href="/(auth)/sign-up" style={{ alignSelf: 'center' }}>
            <Text variant="body" color="textSecondary">
              Hesabınız yok mu? <Text variant="body" color="brandPrimary">Kayıt olun</Text>
            </Text>
          </Link>
        </Stack>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
