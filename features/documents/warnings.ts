import { getLanguage, t } from '@/i18n';

export interface DocumentWarning {
  source: string;
  en?: string;
}

// Keep the original text and align translations before filtering invalid entries.
export function documentWarningEntries(output: unknown): DocumentWarning[] {
  if (!output || typeof output !== 'object') return [];
  const { warnings, warningsEn } = output as { warnings?: unknown; warningsEn?: unknown };
  if (!Array.isArray(warnings)) return [];
  const english = Array.isArray(warningsEn) && warningsEn.length === warnings.length ? warningsEn : [];
  return warnings.flatMap((source, index) => typeof source === 'string'
    ? [{ source, ...(typeof english[index] === 'string' && english[index].trim() ? { en: english[index] } : {}) }]
    : []);
}

// Accept strings from persisted query caches created by older app versions.
export function documentWarningText(warning: DocumentWarning | string): string {
  const source = typeof warning === 'string' ? warning : warning.source;
  if (getLanguage() === 'tr') return source;
  if (typeof warning !== 'string' && warning.en) return warning.en;
  if (source === 'Rakamla ve yazıyla tutar uyuşmuyor') return t('documentWarnings.amountMismatch');
  const uncertain = /^Tutar okuması belirsiz: belgede "(.*)" yazıyor\. Kaydedilen tutar (.*); lütfen doğrulayın\.$/s.exec(source);
  if (uncertain) return t('documentWarnings.uncertainAmount', { raw: uncertain[1], amount: uncertain[2] });
  // Legacy AI warnings are arbitrary prose: do not silently discard their details.
  return source;
}
