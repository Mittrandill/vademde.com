import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, Stack, Text, TextField } from '@/components/primitives';
import { updatePassword } from '@/features/auth/api';
import { translateAuthError } from '@/features/auth/errors';

// services/authDeepLinks.ts, şifre sıfırlama e-postasındaki bağlantıyı yakalayıp oturumu
// kurduktan sonra buraya yönlendirir; kullanıcı burada yeni şifresini belirler.
export default function ResetPasswordScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = password.length >= 6 && !mismatch;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await updatePassword(password);
      router.replace('/(tabs)');
    } catch (err) {
      setError(translateAuthError(err, 'Şifre güncellenemedi'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: theme.screenEdge.standard }}
        >
          <Stack gap="xl">
            <Stack gap="xs">
              <Text variant="pageTitle">Yeni Şifre Belirle</Text>
              <Text variant="body" color="textSecondary">
                Hesabınız için yeni bir şifre girin.
              </Text>
            </Stack>

            <Stack gap="sm">
              <TextField
                placeholder="Yeni şifre"
                secureTextEntry={!passwordVisible}
                value={password}
                onChangeText={setPassword}
                rightIcon={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                onRightIconPress={() => setPasswordVisible((v) => !v)}
              />
              <TextField
                placeholder="Yeni şifre (tekrar)"
                secureTextEntry={!passwordVisible}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={mismatch ? 'Şifreler eşleşmiyor.' : undefined}
              />
            </Stack>

            {error ? (
              <Text variant="caption" color="danger">
                {error}
              </Text>
            ) : null}

            <Button label="Şifreyi Güncelle" onPress={handleSubmit} loading={loading} disabled={!canSubmit} />
          </Stack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
