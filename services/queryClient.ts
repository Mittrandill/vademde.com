import { t } from '@/i18n';
import { QueryClient, onlineManager, focusManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';

// docs/06-teknik-mimari.md §10.6 — veri katmanı: önbellek, sayfalama, realtime,
// çevrimdışı senkronizasyon. Mutation'lar offlineFirst çalışır ve bağlantı
// geri geldiğinde otomatik yeniden denenir.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      // Kayıt değiştiren işlemler ilgili sorguları zaten geçersiz kılar; 30 sn her ekran açılışında
      // ve uygulamaya dönüşte yeniden çekim yapıyordu (Supabase log kotası).
      staleTime: 2 * 60_000,
      retry: (failureCount, error) => failureCount < 2 && !isAccessDenied(error),
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

// Yetki/oturum reddi tekrar denemeyle düzelmez: silinmiş çalışma alanı için entitlements
// sorgusu her açılışta 3 kez gidip 3 hata kaydı açıyordu (2026-11-11, 2026-11-17).
const ACCESS_DENIED_CODES = new Set(['42501', 'PGRST301', 'PGRST302', 'PGRST303']);

function isAccessDenied(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && ACCESS_DENIED_CODES.has(code);
}

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'vademde-query-cache',
});

const CACHE_OWNER_KEY = 'vademde-query-cache-owner';
let sessionCacheWork: Promise<void> = Promise.resolve();

// Session events are received by several mounted hooks. Serialize the boundary
// once; retain the cache across launches/token refreshes for the SAME user.
export function bindQueryCacheToUser(userId: string | null): Promise<void> {
  const next = sessionCacheWork.then(async () => {
    const previousOwner = await AsyncStorage.getItem(CACHE_OWNER_KEY);
    if (previousOwner === userId) {
      // Restored writes may only resume AFTER their owner is authenticated.
      if (userId) void queryClient.resumePausedMutations();
      return;
    }
    assertNoPendingFinancialWrites();
    await queryClient.cancelQueries();
    // Only downloaded query data is removed, never SQLite drafts or finance rows.
    queryClient.removeQueries();
    queryClient.getMutationCache().clear();
    await asyncStoragePersister.removeClient();
    if (userId) await AsyncStorage.setItem(CACHE_OWNER_KEY, userId);
    else await AsyncStorage.removeItem(CACHE_OWNER_KEY);
  });
  sessionCacheWork = next.catch(() => undefined);
  return next;
}

export function assertNoPendingFinancialWrites(): void {
  if (queryClient.getMutationCache().getAll().some((m) => m.state.status === 'pending')) {
    throw new Error(t('runtime.pendingWriteLogout'));
  }
}

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === 'active');
}

export function attachFocusManager() {
  const subscription = AppState.addEventListener('change', onAppStateChange);
  return () => subscription.remove();
}
