import { getLanguage } from '@/i18n';
import messages from './en.json';
export function assetText(text: string): string {
  return getLanguage() === 'en'
    ? ((messages as Record<string, string>)[text] ?? text)
    : text;
}
