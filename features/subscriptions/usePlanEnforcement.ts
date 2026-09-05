import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/services/queryKeys';
import { syncPlanEnforcement, type PlanEnforcementState } from './api';

// Plan limiti durumunun uygulama genelindeki tek okuma noktası. sync_plan_enforcement
// RPC'si aynı zamanda limit aşımı ilk tespit edildiğinde 14 günlük lütuf süresini başlatır,
// bu yüzden sorgu uygulamanın açılış ekranlarında (dashboard, çalışma alanı listesi)
// mount edilir — kullanıcı uyarıyı görmeden kilit devreye girmez.
//
// staleTime uzun tutulur: durum gün ölçeğinde değişir, her ekran geçişinde ağ isteği
// atmanın anlamı yok. Abonelik satın alındığında çağıran taraf bu anahtarı invalidate eder.
export function usePlanEnforcement() {
  return useQuery<PlanEnforcementState | null>({
    queryKey: queryKeys.planEnforcement(),
    queryFn: syncPlanEnforcement,
    staleTime: 5 * 60 * 1000,
  });
}
