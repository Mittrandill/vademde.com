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

export interface DeliveredReminder extends Reminder {
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

const RECENT_REMINDERS_SELECT =
  '*, obligation:obligations(id, title, direction, document_type, bank_code, service_code, remaining_amount_minor, currency_code, due_date), account:accounts(id, name, bank_code)';

export interface ListRecentRemindersFilter {
  workspaceId: string;
  page?: number;
  pageSize?: number;
}

// supabase/functions/send-reminders push'u gerçekten attıktan sonra satırı 'delivered'
// yapıyor. Bildirimler ekranı bu fonksiyonla yalnızca 'delivered' satırları gösterir —
// henüz zamanı gelmemiş 'scheduled' satırlar (kayıt oluşturulur oluşturulmaz ileri tarihli
// kademeler için hemen yazılır) burada BİLEREK dışlanır; aksi halde ekran, kullanıcının
// henüz gelmemiş bir bildirimi "gelmiş" sanmasına yol açan bir önizleme listesi olurdu
// (bkz. kullanıcı geri bildirimi). Süre sınırsız olursa hiç temizlenmeyen (dismiss
// edilmeyen) eski bildirimler listeyi sonsuza dek büyütürdü, bu yüzden son birkaç günle sınırlanır.
const DELIVERED_LOOKBACK_DAYS = 3;

export async function listRecentReminders({
  workspaceId,
  page = 0,
  pageSize = REMINDERS_PAGE_SIZE,
}: ListRecentRemindersFilter): Promise<DeliveredReminder[]> {
  const lookbackStart = new Date(Date.now() - DELIVERED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('reminders')
    .select(RECENT_REMINDERS_SELECT)
    .eq('workspace_id', workspaceId)
    .eq('status', 'delivered')
    .is('dismissed_at', null)
    .gte('remind_at', lookbackStart)
    .order('remind_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw error;
  return data as unknown as DeliveredReminder[];
}

export async function countRecentReminders(workspaceId: string): Promise<number> {
  const lookbackStart = new Date(Date.now() - DELIVERED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('reminders')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'delivered')
    .is('dismissed_at', null)
    .gte('remind_at', lookbackStart);
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

// supabase/functions/send-reminders (pg_cron ile 15 dakikada bir) bu token'lara Expo Push
// API üzerinden gönderir — bkz. services/pushToken.ts.
export async function upsertPushToken(input: TablesInsert<'push_tokens'>): Promise<void> {
  const { error } = await supabase.from('push_tokens').upsert(input, { onConflict: 'token' });
  if (error) throw error;
}

export async function deletePushToken(token: string): Promise<void> {
  const { error } = await supabase.from('push_tokens').delete().eq('token', token);
  if (error) throw error;
}
