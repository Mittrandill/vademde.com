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

// Kredi kartı "ekstre yükle" hatırlatmaları — obligation henüz yokken hesap +
// dönem (period_key, ör. "2026-08") bazında tekilleştirilir (bkz. reminders_account_period_stage_key).
export async function getStatementUploadReminders(accountId: string): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('account_id', accountId)
    .eq('kind', 'statement_upload');
  if (error) throw error;
  return data;
}

export async function upsertAccountReminder(input: TablesInsert<'reminders'>): Promise<Reminder> {
  const { data, error } = await supabase
    .from('reminders')
    .upsert(input, { onConflict: 'account_id,period_key,stage' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
