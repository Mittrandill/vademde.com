import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert } from '@/db/database.types';

export type Reminder = Tables<'reminders'>;

// Bir obligation için birden fazla hatırlatma satırı olabilir (7 gün önce/3 gün önce/
// vade günü — bkz. reminders_obligation_id_stage_key unique kısıtı).
export async function getRemindersForObligation(obligationId: string): Promise<Reminder[]> {
  const { data, error } = await supabase.from('reminders').select('*').eq('obligation_id', obligationId);
  if (error) throw error;
  return data;
}

export async function upsertReminder(input: TablesInsert<'reminders'>): Promise<Reminder> {
  const { data, error } = await supabase
    .from('reminders')
    .upsert(input, { onConflict: 'obligation_id,stage' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
