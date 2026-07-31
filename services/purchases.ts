import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';

// docs/10-abonelik-gelir-modeli.md — App Store makbuz doğrulaması RevenueCat
// sunucularında yapılır; bu modül yalnızca ince bir SDK sarmalayıcısıdır.
// RevenueCat App User ID = Supabase auth user id (owner_id).
// Vademde iOS-first bir uygulama (bkz. CLAUDE.md); web, Expo'nun varsayılan
// fallback hedefi ve gerçek dağıtım platformumuz değil. react-native-purchases
// web'de RevenueCat'in ayrı bir ürünü olan Web Billing'i kullanmaya çalışıp
// farklı bir key formatı bekliyor — bu yüzden web'de hiç configure edilmez.
const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

let configured = false;

export function configurePurchases(ownerId: string): void {
  if (Platform.OS !== 'ios') return;
  if (!REVENUECAT_IOS_KEY) {
    console.warn('EXPO_PUBLIC_REVENUECAT_IOS_KEY tanımlı değil; satın alma özellikleri devre dışı.');
    return;
  }
  try {
    Purchases.configure({ apiKey: REVENUECAT_IOS_KEY, appUserID: ownerId });
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
