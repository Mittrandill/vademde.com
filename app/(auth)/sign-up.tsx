import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme';
import { useReflowKey } from '@/services/reflow';
import { Button, FieldGroup, Pressable, Text, TextField } from '@/components/primitives';
import { ScreenHeader } from '@/components/navigation/ScreenHeader';
import { SocialSignInButtons } from '@/components/auth/SocialSignInButtons';
import { signInWithApple, signInWithGoogle, signUpWithPassword } from '@/features/auth/api';
import { translateAuthError } from '@/features/auth/errors';
import { useTranslation } from '@/i18n';

export default function SignUpScreen() {
  const theme = useTheme();
  const reflowKey = useReflowKey();
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [accepted, setAccepted] = useState(false);
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
    if (!accepted) {
      setError(t('auth.signUp.mustAccept'));
      return;
    }
    setLoading(true);
    try {
      await signUpWithPassword(email.trim(), password, fullName);
      setConfirmationSent(true);
    } catch (err) {
      setError(translateAuthError(err, t('auth.signUp.failed')));
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
        setError(translateAuthError(err, t('auth.signUp.appleFailed')));
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
      setError(translateAuthError(err, t('auth.signUp.googleFailed')));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <SafeAreaView key={reflowKey} style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: theme.screenEdge.standard, paddingBottom: theme.spacing.lg }}
        >
          <ScreenHeader title={t('auth.signUp.title')} inline />

          {confirmationSent ? (
            <View style={{ alignItems: 'center', marginTop: theme.spacing.huge, gap: theme.spacing.sm }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255,176,0,0.16)',
                }}
              >
                <Ionicons name="mail" size={34} color={theme.colors.attentionMarker} />
              </View>
              <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.56, marginTop: theme.spacing.sm, textAlign: 'center' }}>
                {t('auth.signUp.verifyTitle')}
              </Text>
              <Text color="textSecondary" style={{ textAlign: 'center', maxWidth: 300 }}>
                {t('auth.signUp.verifyBody')}
              </Text>
            </View>
          ) : (
            <>
              <View style={{ marginTop: theme.spacing.md }}>
                <FieldGroup>
                  <TextField
                    label={t('auth.signUp.fullName')}
                    placeholder={t('auth.signUp.fullNamePlaceholder')}
                    autoCapitalize="words"
                    textContentType="name"
                    value={fullName}
                    onChangeText={setFullName}
                  />
                  <TextField
                    label={t('auth.email')}
                    placeholder={t('auth.emailPlaceholder')}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                  />
                  <TextField
                    label={t('auth.password')}
                    placeholder={t('auth.signUp.passwordPlaceholder')}
                    secureTextEntry={!passwordVisible}
                    value={password}
                    onChangeText={setPassword}
                    rightIcon={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                    onRightIconPress={() => setPasswordVisible((v) => !v)}
                  />
                </FieldGroup>
                <Text variant="caption" color="textSecondary" style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                  {t('auth.signUp.verifyHint')}
                </Text>
              </View>

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: accepted }}
                onPress={() => setAccepted((v) => !v)}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 44, marginTop: theme.spacing.md }}
              >
                <Ionicons
                  name={accepted ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={accepted ? theme.colors.textPrimary : theme.colors.mutedControl}
                />
                <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                  {t('auth.signUp.acceptPrefix')}
                  <Link href="/legal/terms-of-service">
                    <Text variant="caption" style={{ textDecorationLine: 'underline' }}>{t('auth.signUp.terms')}</Text>
                  </Link>
                  {t('auth.signUp.and')}
                  <Link href="/legal/privacy-policy">
                    <Text variant="caption" style={{ textDecorationLine: 'underline' }}>{t('auth.signUp.privacy')}</Text>
                  </Link>
                  {t('auth.signUp.acceptSuffix')}
                </Text>
              </Pressable>

              {error ? (
                <Text variant="caption" color="danger" style={{ marginTop: theme.spacing.xs }}>
                  {error}
                </Text>
              ) : null}

              <View style={{ marginTop: theme.spacing.lg }}>
                <SocialSignInButtons
                  onApplePress={handleApple}
                  onGooglePress={handleGoogle}
                  appleLoading={appleLoading}
                  googleLoading={googleLoading}
                  disabled={loading}
                />
              </View>

              <View style={{ flex: 1, minHeight: theme.spacing.lg }} />
              <Button label={t('auth.signUp.submit')} onPress={handleSubmit} loading={loading} />
            </>
          )}

          <Link href="/(auth)/sign-in" style={{ alignSelf: 'center', paddingVertical: 12 }}>
            <Text color="textSecondary">
              {t('auth.signUp.haveAccount')}<Text style={{ fontWeight: '600' }}>{t('auth.signUp.signInLink')}</Text>
            </Text>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
