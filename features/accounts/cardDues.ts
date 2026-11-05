// Kredi kartı son ödemelerinin takvim/Ana Sayfa'da görünmesi.
//
// Takvim, "Yaklaşan vadeler" ve Ana Sayfa'daki toplam borç yalnızca obligations tablosunu okur.
// Kart borcu ise kart hesabında yaşar (açılış bakiyesi + harcamalar, ekstre girildiyse ekstre
// çapası — bkz. utils/cardDebt.ts). Kullanıcıların çoğu ekstre girmediği için kart borcu bu
// ekranların hiçbirine yansımıyordu. Burada ekstre kaydının KARŞILAMADIĞI borç
// (güncel kart borcu − açık ekstrelerin kalanı; onlar zaten kendi kaydıyla görünür) kartın son
// ödeme günlerine sanal vade kalemleri olarak dağıtılır:
//   - Her borç kalemi (açılış bakiyesi, harcama, nakit avans) düştüğü dönemin son ödeme gününe
//     yazılır: harcama kesim gününe göre, açılış bakiyesi girildiği günden sonraki ilk son ödemeye.
//   - Ödemeler en eski borçtan düşer: kalan borç en yeni dönemden geriye doğru dağıtılır. Böylece
//     ödenmeyen dönem son ödeme günü geçince silinmez, "gecikti" olarak yerinde kalır; kalemlerin
//     toplamı her zaman güncel borca eşittir (ertesi ayın kalemiyle çift sayılmaz).
//   - Kullanıcı kartın güncel borcunu yeniden girerse (açılış bakiyesi değişir) eski dönemler o
//     rakamın içinde sayılır ve borç girildiği günden sonraki ilk son ödemeye taşınır.
// Bu kalemler veritabanı kaydı değildir; dokunulduğunda kart sayfasına gidilir (card_due_account_id).
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/services/supabase';
import { fetchAll } from '@/services/fetchAll';
import { queryKeys } from '@/services/queryKeys';
import { listAccounts } from '@/features/accounts/api';
import { getAccountBalances } from '@/features/accounts/balances';
import type { ObligationDueItem } from '@/features/obligations/api';
import { useLanguage } from '@/i18n';

import { buildCardDueItems, type CardStatementRef } from '@/utils/cardDues';

export { buildCardDueItems, nextCardDue, statementPeriodKey } from '@/utils/cardDues';

async function listCardStatementRefs(workspaceId: string): Promise<CardStatementRef[]> {
  return fetchAll<CardStatementRef>((from, to) =>
    supabase
      .from('obligations')
      .select('account_id, due_date, statement_date, status, remaining_amount_minor')
      .eq('workspace_id', workspaceId)
      .eq('document_type', 'kredi_karti_ekstresi')
      .order('id')
      .range(from, to)
  );
}

// Sorgu anahtarları Ana Sayfa/hesaplar ekranlarıyla aynıdır (önbellek paylaşılır); ekstre
// listesi [ws, 'obligations', ...] altında olduğu için ödeme/kayıt değişikliklerinde tazelenir.
export function useCardDueItems(workspaceId: string | null): { items: ObligationDueItem[]; isSuccess: boolean } {
  const language = useLanguage();
  const accountsQuery = useQuery({
    queryKey: workspaceId ? queryKeys.accounts(workspaceId) : ['accounts', 'disabled'],
    queryFn: () => listAccounts(workspaceId as string),
    enabled: !!workspaceId,
  });
  const hasCards = (accountsQuery.data ?? []).some((a) => a.type === 'credit_card');
  const balancesQuery = useQuery({
    queryKey: workspaceId ? [workspaceId, 'account-balances'] : ['account-balances', 'disabled'],
    queryFn: () => getAccountBalances(workspaceId as string),
    enabled: !!workspaceId,
  });
  const statementsQuery = useQuery({
    queryKey: workspaceId ? [workspaceId, 'obligations', 'card-statement-refs'] : ['card-statement-refs', 'disabled'],
    queryFn: () => listCardStatementRefs(workspaceId as string),
    enabled: !!workspaceId && hasCards,
  });

  const items = useMemo(
    () =>
      hasCards && balancesQuery.data && statementsQuery.data
        ? buildCardDueItems(accountsQuery.data ?? [], balancesQuery.data, statementsQuery.data)
        : [],
    // Titles come from the active i18n language; recompute on a language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasCards, accountsQuery.data, balancesQuery.data, statementsQuery.data, language]
  );

  return {
    items,
    isSuccess: accountsQuery.isSuccess && (!hasCards || (balancesQuery.isSuccess && statementsQuery.isSuccess)),
  };
}
