import { t } from '@/i18n';

export function getLegalSections(kind: 'privacy' | 'terms'): { title: string; body: string }[] {
  const sections = kind === 'privacy'
    ? t('legal.privacy.sections', { returnObjects: true })
    : t('legal.terms.sections', { returnObjects: true });
  return Object.values(sections);
}
