import { useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';

// Bilinen React Native kısıtı: sistem yazı boyutu (iOS Dynamic Type) uygulama açıkken
// değiştirilirse, zaten mount olmuş ekranların bir kerelik ölçülen layout değerleri (ör.
// onLayout ile alınan genişlik/yükseklik — bkz. BalanceHero pageWidth) otomatik yeniden
// hesaplanmaz; kullanıcı ekrandan çıkıp geri girene (veya uygulamayı yeniden başlatana)
// kadar bozuk kalır. Önceki sürüm bu sayacı yalnızca ekran odağa geldiğinde veya uygulama
// arka plandan öne döndüğünde artırıyordu — ama Denetim Merkezi'nden (Control Center)
// yazı boyutu değiştirmek uygulamayı arka plana atmaz ve ekranın odağını bozmaz, o yüzden
// bu iki tetikleyici hiç ateşlenmeden ekran bozuk kalabiliyordu. useWindowDimensions zaten
// fontScale'i canlı takip ediyor; doğrudan onu izlemek (odak/AppState'i beklemeden) bu
// boşluğu kapatır — sayaç, sistem yazı boyutu gerçekten değiştiği anda artar, ekran o anda
// mount edilmemiş (arka plandaki bir sekme) olsa bile.
export function useReflowKey(): number {
  const { fontScale } = useWindowDimensions();
  const lastScaleRef = useRef(fontScale);
  const [reflowKey, setReflowKey] = useState(0);

  useEffect(() => {
    if (lastScaleRef.current !== fontScale) {
      lastScaleRef.current = fontScale;
      setReflowKey((key) => key + 1);
    }
  }, [fontScale]);

  return reflowKey;
}
