import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, Stack, Text, TextField } from '@/components/primitives';
import { updatePassword } from '@/features/auth/api';
import { translateAuthError } from '@/features/auth/errors';
import { useTranslation } from '@/i18n';

// services/authDeepLinks.ts, şifre sıfırlama e-postasındaki bağlantıyı yakalayıp oturumu
// kurduktan sonra buraya yönlendirir; kullanıcı burada yeni şifresini belirler.
export default function ResetPasswordScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const { t } = useTranslation();
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
      setError(translateAuthError(err, t('auth.resetPassword.failed')));
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
              <Text variant="pageTitle">{t('auth.resetPassword.title')}</Text>
              <Text variant="body" color="textSecondary">
                {t('auth.resetPassword.subtitle')}
              </Text>
            </Stack>

            <Stack gap="sm">
              <TextField
                placeholder={t('auth.resetPassword.newPassword')}
                secureTextEntry={!passwordVisible}
                value={password}
                onChangeText={setPassword}
                rightIcon={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                onRightIconPress={() => setPasswordVisible((v) => !v)}
              />
              <TextField
                placeholder={t('auth.resetPassword.confirmPassword')}
                secureTextEntry={!passwordVisible}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={mismatch ? t('auth.resetPassword.mismatch') : undefined}
              />
            </Stack>

            {error ? (
              <Text variant="caption" color="danger">
                {error}
              </Text>
            ) : null}

            <Button label={t('auth.resetPassword.submit')} onPress={handleSubmit} loading={loading} disabled={!canSubmit} />
          </Stack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
