import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, View, type AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/theme';
import { Button, Pressable, Stack, Text } from '@/components/primitives';
import { VademdeMark } from '@/components/brand/VademdeMark';
import { useAppLockStore } from '@/store/appLockStore';
import { authenticate, getBiometricSupport } from '@/services/appLock';
import { getMySubscription, getPlanLimits, type PlanCode } from '@/features/subscriptions/api';
import { queryKeys } from '@/services/queryKeys';
import { signOut } from '@/features/auth/api';

// Uygulama arka plana alındıktan sonra bu süreyi aşarsa yeniden kilitlenir. Her sekme
// değişiminde veya bildirim çekmecesini açıp kapatınca Face ID sormak kullanılamaz bir
// deneyim olurdu; 30 saniye "elimden bıraktım" ile "kamerayı açıp fatura fotoğrafı
// çektim" arasını ayıran pratik eşik.
const RELOCK_AFTER_MS = 30 * 1000;

// docs/10-abonelik-gelir-modeli.md — Face ID kilidi Plus ve İşletme planlarının özelliği.
// Kilit tercihi cihazda tutulur (store/appLockStore.ts) ama her açılışta plan yeniden
// doğrulanır: abonelik biterse kilit sessizce devre dışı kalır, kullanıcı kendi verisine
// erişemez duruma düşmez.
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const enabled = useAppLockStore((s) => s.enabled);

  const subscriptionQuery = useQuery({ queryKey: queryKeys.subscription(), queryFn: getMySubscription });
  const plan: PlanCode = (subscriptionQuery.data?.plan as PlanCode) ?? 'free';
  const limitsQuery = useQuery({
    queryKey: [...queryKeys.planLimits(), plan],
    queryFn: () => getPlanLimits(plan),
    enabled: subscriptionQuery.isSuccess,
  });
  const planAllowsLock = limitsQuery.data?.face_id ?? false;

  const supportQuery = useQuery({ queryKey: ['biometric-support'], queryFn: getBiometricSupport });
  const label = supportQuery.data?.label ?? 'Biyometrik kilit';

  const active = enabled && planAllowsLock && (supportQuery.data?.available ?? false);
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const backgroundedAtRef = useRef<number | null>(null);

  // Aynı anda birden fazla biyometrik istemi açılmasın diye ref ile korunur (state değil:
  // efekt içinde senkron setState cascading render'a yol açar, bkz. react-hooks kuralı).
  const promptingRef = useRef(false);

  const unlock = useCallback(async () => {
    if (promptingRef.current) return;
    promptingRef.current = true;
    setChecking(true);
    const success = await authenticate("Vademde'yi aç");
    promptingRef.current = false;
    setChecking(false);
    if (success) setUnlocked(true);
  }, []);

  // Kilit ilk kez etkinleştiğinde (veya uygulama arka plandan dönüp yeniden kilitlendiğinde)
  // istem otomatik açılır — kullanıcının önce bir butona basması gereksiz bir adım olurdu.
  // Buton yalnızca istem iptal edilirse tekrar denemek için kalır.
  useEffect(() => {
    if (!active || unlocked || promptingRef.current) return;
    promptingRef.current = true;
    let cancelled = false;
    authenticate("Vademde'yi aç")
      .then((success) => {
        promptingRef.current = false;
        if (!cancelled && success) setUnlocked(true);
      })
      .catch(() => {
        promptingRef.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [active, unlocked]);

  useEffect(() => {
    if (!active) return;
    function handleChange(state: AppStateStatus) {
      if (state === 'active') {
        const backgroundedAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (backgroundedAt !== null && Date.now() - backgroundedAt >= RELOCK_AFTER_MS) {
          setUnlocked(false);
        }
      } else if (state === 'background') {
        backgroundedAtRef.current = Date.now();
      }
    }
    const subscription = AppState.addEventListener('change', handleChange);
    return () => subscription.remove();
  }, [active]);

  if (!active || unlocked) return <>{children}</>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}>
      <View style={{ flex: 1, padding: theme.screenEdge.standard, alignItems: 'center' }}>
        <Stack gap="lg" align="center" style={{ flex: 1, justifyContent: 'center' }}>
          <VademdeMark size={72} />
          <Stack gap="xxs" align="center">
            <Text variant="pageTitle" style={{ textAlign: 'center' }}>
              Uygulama kilitli
            </Text>
            <Text variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
              Devam etmek için {label} ile kimliğini doğrula
            </Text>
          </Stack>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label} ile aç`}
            onPress={unlock}
            disabled={checking}
            style={{
              width: 96,
              height: 96,
              borderRadius: 30,
              marginTop: theme.spacing.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surfacePrimary,
            }}
          >
            <Ionicons name="finger-print" size={44} color={theme.colors.textPrimary} />
          </Pressable>
        </Stack>
        <View style={{ alignSelf: 'stretch' }}>
          <Button label={`${label} ile aç`} onPress={unlock} loading={checking} />
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              Alert.alert('Şifreyle giriş yap', 'Oturumun kapatılacak; e-posta ve şifrenle yeniden giriş yapabilirsin.', [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Oturumu Kapat', style: 'destructive', onPress: () => void signOut().catch(() => undefined) },
              ])
            }
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.xs }}
          >
            <Text variant="body" color="textSecondary">
              Şifreyle giriş yap
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
