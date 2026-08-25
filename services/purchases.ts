import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';

// docs/10-abonelik-gelir-modeli.md — mağaza makbuz doğrulaması RevenueCat
// sunucularında yapılır; bu modül yalnızca ince bir SDK sarmalayıcısıdır.
// RevenueCat App User ID = Supabase auth user id (owner_id).
// Apple App Store ve Google Play ayrı public SDK anahtarları kullanır. Web,
// RevenueCat'in ayrı ürünü Web Billing'i gerektirdiği için burada configure edilmez.
const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

let configured = false;

export function configurePurchases(ownerId: string): void {
  const apiKey = Platform.select({
    ios: REVENUECAT_IOS_KEY,
    android: REVENUECAT_ANDROID_KEY,
  });
  if (!apiKey) {
    if (Platform.OS !== 'web') {
      console.warn(`RevenueCat ${Platform.OS} SDK anahtarı tanımlı değil; satın alma özellikleri devre dışı.`);
    }
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
