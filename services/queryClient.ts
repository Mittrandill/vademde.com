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
      staleTime: 30_000,
      retry: 2,
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

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
    throw new Error('Devam eden veya bağlantı bekleyen işlem var. İşlem sonuçlanmadan çıkış yapmayın.');
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
