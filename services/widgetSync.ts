import { Platform } from 'react-native';

// iOS ana ekran / kilit ekranı widget'ları (targets/widget) uygulamayla App Group
// UserDefaults üzerinden konuşur; widget ağa/Supabase'e hiç bağlanmaz. Uygulama yalnızca
// AKTİF çalışma alanının özetini yazar (bağlayıcı kural #3) ve çıkışta/alan değişiminde
// temizler. Native modül eski bir dev build'de yoksa tüm çağrılar sessizce no-op olur.
export const WIDGET_APP_GROUP = 'group.com.akintkaya.vademde.widget';
const SNAPSHOT_KEY = 'snapshot';
const HIDE_KEY = 'hideAmounts';

export interface WidgetDueItem {
  title: string;
  kind: string;
  /** yyyy-MM-dd (yerel gün) — kalan gün widget tarafında hesaplanır, hep güncel kalır. */
  date: string;
  amount: string;
  receivable: boolean;
  overdue: boolean;
  bank?: string;
}

export interface WidgetSnapshot {
  v: 1;
  workspaceId: string;
  workspaceName: string;
  updatedAt: number;
  balance: string;
  receivable: string;
  payable: string;
  monthNet: string;
  monthNetShort: string;
  weekPayable: string;
  weekReceivable: string;
  weekPayableMinor: number;
  weekReceivableMinor: number;
  items: WidgetDueItem[];
}

type Storage = {
  set: (key: string, value?: string) => void;
};

let cachedStorage: Storage | null | undefined;
let cachedReload: (() => void) | null = null;

function getStorage(): Storage | null {
  if (Platform.OS !== 'ios') return null;
  if (cachedStorage !== undefined) return cachedStorage;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExtensionStorage } = require('@bacons/apple-targets');
    cachedStorage = new ExtensionStorage(WIDGET_APP_GROUP) as Storage;
    cachedReload = () => ExtensionStorage.reloadWidget();
  } catch {
    cachedStorage = null;
  }
  return cachedStorage;
}

function write(key: string, value: string | undefined) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.set(key, value);
    cachedReload?.();
  } catch {
    // Widget güncellemesi uygulamanın akışını asla bozmamalı.
  }
}

export function writeWidgetSnapshot(snapshot: WidgetSnapshot) {
  write(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function clearWidgetSnapshot() {
  write(SNAPSHOT_KEY, undefined);
}

export function writeWidgetHideAmounts(hide: boolean) {
  write(HIDE_KEY, hide ? '1' : '0');
}
