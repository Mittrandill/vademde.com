import { supabase } from '@/services/supabase';
import type { Tables, TablesInsert } from '@/db/database.types';

export type Reminder = Tables<'reminders'>;

export async function getReminderForObligation(obligationId: string): Promise<Reminder | null> {
  const { data, error } = await supabase.from('reminders').select('*').eq('obligation_id', obligationId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertReminder(input: TablesInsert<'reminders'>): Promise<Reminder> {
  const { data, error } = await supabase
    .from('reminders')
    .upsert(input, { onConflict: 'obligation_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
