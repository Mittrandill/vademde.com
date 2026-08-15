import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';

// Bilinen React Native kısıtı: sistem yazı boyutu (iOS Dynamic Type) uygulama açıkken
// veya arka plandayken değiştirilirse, zaten mount olmuş ekranların bir kerelik ölçülen
// layout değerleri (ör. onLayout ile alınan genişlik/yükseklik — bkz. BalanceHero
// pageWidth) otomatik yeniden hesaplanmaz; kullanıcı ekrandan çıkıp geri girene (veya
// uygulamayı yeniden başlatana) kadar bozuk kalır. Bu hook, ekran odağa geldiğinde
// (sekme değişimi) VEYA uygulama arka plandan öne döndüğünde ölçek gerçekten değiştiyse
// bir sayaç artırır; ekran bu sayacı sarmalayıcı bir View'a `key` olarak verip kendini
// yeniden mount ederek güncel ölçekle yeniden ölçülür — kullanıcının elle yaptığı
// "girip çık" düzeltmesinin otomatik hali.
export function useReflowKey(): number {
  const { fontScale } = useWindowDimensions();
  const lastScaleRef = useRef(fontScale);
  const [reflowKey, setReflowKey] = useState(0);

  const checkAndBump = useCallback((currentScale: number) => {
    if (lastScaleRef.current !== currentScale) {
      lastScaleRef.current = currentScale;
      setReflowKey((key) => key + 1);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkAndBump(fontScale);
    }, [checkAndBump, fontScale])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAndBump(fontScale);
    });
    return () => subscription.remove();
  }, [checkAndBump, fontScale]);

  return reflowKey;
}
