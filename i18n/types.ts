// Kaynak dil Türkçedir (i18n/locales/tr). Diğer diller aynı anahtar ağacını string değerlerle
// doldurmak zorundadır — eksik ya da fazla anahtar TypeScript hatası verir.
export type Messages<T> = {
  [K in keyof T]: T[K] extends string ? string : Messages<T[K]>;
};

export type AppLanguage = 'tr' | 'en';
