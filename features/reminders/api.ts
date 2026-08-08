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

export interface UpcomingReminder extends Reminder {
  obligation: {
    id: string;
    title: string;
    direction: string;
    document_type: string;
    bank_code: string | null;
    service_code: string | null;
    remaining_amount_minor: number;
    currency_code: string;
    due_date: string | null;
  } | null;
  account: {
    id: string;
    name: string;
    bank_code: string | null;
  } | null;
}

export const REMINDERS_PAGE_SIZE = 10;

const UPCOMING_REMINDERS_SELECT =
  '*, obligation:obligations(id, title, direction, document_type, bank_code, service_code, remaining_amount_minor, currency_code, due_date), account:accounts(id, name, bank_code)';

export interface ListUpcomingRemindersFilter {
  workspaceId: string;
  page?: number;
  pageSize?: number;
}

// Bildirimler ekranı — henüz vadesi geçmemiş (remind_at gelecekte kalan), temizlenmemiş
// tüm hatırlatmaları kronolojik sırayla, sayfa başına 10 kayıt döner. syncObligationReminder/
// syncCreditCardStatementReminder zaten OS bildirimini planlarken bu satırları yazıyor;
// burada sadece görüntüleme için obligation/hesap bilgisiyle join'leniyor.
export async function listUpcomingReminders({
  workspaceId,
  page = 0,
  pageSize = REMINDERS_PAGE_SIZE,
}: ListUpcomingRemindersFilter): Promise<UpcomingReminder[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select(UPCOMING_REMINDERS_SELECT)
    .eq('workspace_id', workspaceId)
    .eq('status', 'scheduled')
    .is('dismissed_at', null)
    .gte('remind_at', new Date().toISOString())
    .order('remind_at', { ascending: true })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  return data as unknown as UpcomingReminder[];
}

export async function countUpcomingReminders(workspaceId: string): Promise<number> {
  const { count, error } = await supabase
    .from('reminders')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'scheduled')
    .is('dismissed_at', null)
    .gte('remind_at', new Date().toISOString());
  if (error) throw error;
  return count ?? 0;
}

export async function markReminderRead(id: string): Promise<void> {
  const { error } = await supabase.from('reminders').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function markAllRemindersRead(workspaceId: string): Promise<void> {
  const { error } = await supabase
    .from('reminders')
    .update({ read_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .is('read_at', null)
    .is('dismissed_at', null);
  if (error) throw error;
}

// docs/01-finansal-kayit-modeli.md ile aynı ilke: "temizleme" bu satırı yalnızca
// bildirim gelen kutusundan gizler; syncObligationReminder'ın planladığı gerçek OS
// bildirimini iptal etmez — vadesi gelen gerçek bir borç/alacak sessizce unutulmasın diye.
export async function dismissReminder(id: string): Promise<void> {
  const { error } = await supabase.from('reminders').update({ dismissed_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function dismissAllReminders(workspaceId: string): Promise<void> {
  const { error } = await supabase
    .from('reminders')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .is('dismissed_at', null);
  if (error) throw error;
}
