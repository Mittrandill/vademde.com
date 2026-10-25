import { t } from '@/i18n';
import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { router, useNavigation } from 'expo-router';

// Tuval: CikisKorumasi — kaydedilmemiş değişiklik varken çıkışta onay sheet'i.
// Kaydetme sonrası `allowExit()` çağrılırsa koruma devre dışı kalır.
export function useExitGuard(dirty: boolean) {
  const navigation = useNavigation();
  const allowed = useRef(false);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (allowed.current || !dirty) return;
      e.preventDefault();
      Alert.alert(t('runtime.unsavedTitle'), t('runtime.unsavedBody'), [
        { text: t('runtime.keepEditing'), style: 'cancel' },
        {
          text: t('runtime.discardExit'),
          style: 'destructive',
          onPress: () => {
            allowed.current = true;
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
  }, [navigation, dirty]);

  const allowExit = useCallback(() => {
    allowed.current = true;
  }, []);

  return { allowExit, close: () => router.back() };
}
