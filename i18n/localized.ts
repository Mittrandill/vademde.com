// Modül seviyesindeki etiket tabloları (ör. DOCUMENT_TYPE_LABEL[id]) bir kez yüklenir; değerleri
// sabit string olsaydı dil değişince eski dilde kalırdı. Bu yardımcı aynı Record arayüzünü korur
// ama her okumada değeri o anki dilden çözer — çağıranların kodu değişmez.
// Dizi karşılığı (ör. MONTH_NAMES[month], MONTH_NAMES.map(...)): indeksler okunduğu anda çözülür.
export function localizedList(length: number, resolve: (index: number) => string): readonly string[] {
  const target = Array.from({ length }, () => '');
  return new Proxy(target, {
    get: (array, prop, receiver) => {
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        const index = Number(prop);
        return index < length ? resolve(index) : undefined;
      }
      return Reflect.get(array, prop, receiver);
    },
  });
}

export function localizedRecord<K extends string>(
  keys: readonly K[],
  resolve: (key: K) => string
): Record<K, string> {
  const keySet = new Set<string>(keys);
  return new Proxy({} as Record<K, string>, {
    get: (_target, prop) => (typeof prop === 'string' && keySet.has(prop) ? resolve(prop as K) : undefined),
    has: (_target, prop) => typeof prop === 'string' && keySet.has(prop),
    ownKeys: () => [...keys],
    getOwnPropertyDescriptor: (_target, prop) =>
      typeof prop === 'string' && keySet.has(prop)
        ? { enumerable: true, configurable: true, value: resolve(prop as K) }
        : undefined,
  });
}
