import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert } from '@/db/database.types';

export type Payment = Tables<'payments'>;

export async function listPaymentsForObligation(obligationId: string): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('obligation_id', obligationId)
    .order('paid_at', { ascending: false });

  if (error) throw error;
  return data;
}

// docs/01-finansal-kayit-modeli.md §8 — kalan tutar ve durum, veritabanı trigger'larıyla
// (recompute_obligation_progress / recompute_installment_progress) otomatik güncellenir.
export async function recordPayment(input: TablesInsert<'payments'>): Promise<Payment> {
  const { data, error } = await supabase.from('payments').insert(input).select('*').single();
  if (error) throw error;
  return data;
}

export async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) throw error;
}
