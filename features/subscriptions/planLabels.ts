import { t } from '@/i18n';
import { localizedRecord } from '@/i18n/localized';

// docs/10-abonelik-gelir-modeli.md — plan kodu -> görünen ad (Daha fazla, Ayarlar, Abonelik aynı eşlemeyi kullanır).
export const PLAN_LABELS: Record<string, string> = localizedRecord(['free', 'plus', 'isletme'] as const, (plan) =>
  t(`plans.${plan}`)
);
