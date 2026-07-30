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
