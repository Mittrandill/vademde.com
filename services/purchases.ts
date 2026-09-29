import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';

// docs/10-abonelik-gelir-modeli.md — App Store / Play Store makbuz doğrulaması
// RevenueCat sunucularında yapılır; bu modül yalnızca ince bir SDK sarmalayıcısıdır.
// RevenueCat App User ID = Supabase auth user id (owner_id).
// Vademde iOS + Android dağıtımı yapar; web, Expo'nun varsayılan fallback hedefi
// ve gerçek dağıtım platformumuz değil. react-native-purchases web'de
// RevenueCat'in ayrı bir ürünü olan Web Billing'i kullanmaya çalışıp farklı bir
// key formatı bekliyor — bu yüzden web'de hiç configure edilmez.
const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

let configured = false;

export function configurePurchases(ownerId: string): void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  const apiKey = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
  const missingKeyName =
    Platform.OS === 'ios' ? 'EXPO_PUBLIC_REVENUECAT_IOS_KEY' : 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY';
  if (!apiKey) {
    console.warn(`${missingKeyName} tanımlı değil; satın alma özellikleri devre dışı.`);
    return;
  }
  try {
    Purchases.configure({ apiKey, appUserID: ownerId });
    configured = true;
  } catch (error) {
    console.warn('RevenueCat configure edilemedi:', error);
  }
}

export async function logOutPurchases(): Promise<void> {
  if (!configured) return;
  configured = false;
  try {
    await Purchases.logOut();
  } catch {
    // RevenueCat zaten anonim bir kullanıcıdaysa hata fırlatır; oturum kapanışını engellemez.
  }
}

// RevenueCat dashboard'da 'plus' ve 'isletme' plan kodlarıyla eşleşen offering
// identifier'ları tanımlanır (bkz. offerings.all['plus'] / ['isletme']); "current"
// offering tek başına iki ücretli plan tarifesini ayırt edemeyeceği için tüm
// offerings map'i döndürülür.
export async function getOfferings(): Promise<PurchasesOfferings> {
  return Purchases.getOfferings();
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

// App Store, ücretsiz deneme teklifini yalnızca bu abonelik grubunda daha önce deneme kullanmamış
// kullanıcıya sunar. Uygun olmayan (ya da RevenueCat'in kesin hesaplayamadığı, UNKNOWN) kullanıcıya
// "7 gün ücretsiz" vaat etmek yanıltıcı olur; RevenueCat de bu durumda deneme fiyatını değil normal
// fiyatı göstermeyi önerir. Android her zaman UNKNOWN döndürür, bu yüzden orada deneme etiketi çıkmaz.
export async function getTrialEligibility(productIds: string[]): Promise<Record<string, boolean>> {
  if (!configured || productIds.length === 0) return {};
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds);
    const eligible = Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
    return Object.fromEntries(Object.entries(result).map(([id, value]) => [id, value.status === eligible]));
  } catch {
    return {};
  }
}

// Ürünün ücretsiz deneme süresini gün olarak döndürür; deneme yoksa (ya da ücretli bir tanıtım
// fiyatıysa) null. Etiket mağazadaki gerçek tanımdan üretilir, "7 gün" koda gömülmez.
export function freeTrialDays(product: PurchasesPackage['product']): number | null {
  const intro = product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const unitDays: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };
  const perUnit = unitDays[intro.periodUnit];
  if (!perUnit) return null;
  return intro.periodNumberOfUnits * intro.cycles * perUnit;
}
