import type { Tables } from '@/db/database.types';
type Obligation = Tables<'obligations'>;

export const ACTIVE_OBLIGATION_STATUSES: Obligation['status'][] = [
  'taslak',
  'inceleme_gerekli',
  'bekliyor',
  'kismen_odendi',
  'gecikti',
  'kismen_tahsil_edildi',
];

// docs/01-finansal-kayit-modeli.md §3.4 — terminal (kapanmış) durumlar.
export const CLOSED_OBLIGATION_STATUSES: Obligation['status'][] = ['odendi', 'tahsil_edildi', 'iptal_edildi'];
