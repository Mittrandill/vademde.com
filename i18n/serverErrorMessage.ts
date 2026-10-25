import { t } from '@/i18n';
import { serverErrors } from './locales/tr/serverErrors';

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rules = Object.entries(serverErrors).map(([key, template]) => {
  const names: string[] = [];
  const pattern = template.split(/({{value\d+}})/).map((part) => {
    if (!part.startsWith('{{')) return escape(part);
    names.push(part.slice(2, -2));
    return '([\\s\\S]+?)';
  }).join('');
  return { key: key as keyof typeof serverErrors, names, pattern: new RegExp(`^${pattern}$`) };
});

// Match stable server messages without rewriting stored data or interpolated identifiers.
export function serverErrorMessage(raw: string): string | null {
  for (const rule of rules) {
    const match = rule.pattern.exec(raw);
    if (!match) continue;
    const values = Object.fromEntries(rule.names.map((name, index) => [name, match[index + 1]]));
    return t(`serverErrors.${rule.key}`, { ...values, defaultValue: raw });
  }
  return null;
}
