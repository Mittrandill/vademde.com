export type Locale = 'tr' | 'en';

export function resolveLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : 'tr';
}

export function localeTag(locale: Locale): 'tr-TR' | 'en-US' {
  return locale === 'en' ? 'en-US' : 'tr-TR';
}

export async function userLocale(db: { from: (table: string) => any }, userId: string): Promise<Locale> {
  const { data, error } = await db.from('profiles').select('locale').eq('id', userId).single();
  if (error) throw error;
  return resolveLocale(data?.locale);
}

export function formatTry(minor: number, locale: Locale): string {
  return new Intl.NumberFormat(localeTag(locale), { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(minor / 100);
}
