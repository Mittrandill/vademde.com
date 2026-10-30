import { supabase } from '@/services/supabase';
import type { Tables } from '@/db/database.types';

// Destek talepleri web iletişim formuyla aynı tabloda (contact_messages) tutulur; talebe yazılan
// cevaplar support_replies'tadır. RLS kullanıcıya yalnızca kendi taleplerini gösterir: uygulamadan
// açtıkları (user_id) ve web formundan doğrulanmış e-postalarıyla gönderdikleri. Destek tarafı
// cevabı vademde.app admin konsolundan support-reply Edge Function'ı üzerinden yazar.
export type SupportMessage = Pick<Tables<'contact_messages'>, 'id' | 'subject' | 'message' | 'created_at' | 'source'>;
export type SupportReply = Pick<Tables<'support_replies'>, 'id' | 'sender' | 'body' | 'created_at' | 'read_at'>;

export interface SupportThreadSummary extends SupportMessage {
  lastActivityAt: string;
  lastPreview: string;
  /** Kullanıcının henüz görmediği destek cevabı sayısı. */
  unread: number;
}

export async function listSupportThreads(): Promise<SupportThreadSummary[]> {
  const { data, error } = await supabase
    .from('contact_messages')
    .select('id, subject, message, created_at, source, support_replies(id, sender, body, created_at, read_at)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data
    .map((row) => {
      const replies = [...(row.support_replies ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const last = replies[replies.length - 1];
      return {
        id: row.id,
        subject: row.subject,
        message: row.message,
        created_at: row.created_at,
        source: row.source,
        lastActivityAt: last?.created_at ?? row.created_at,
        lastPreview: last?.body ?? row.message,
        unread: replies.filter((r) => r.sender === 'support' && !r.read_at).length,
      };
    })
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export async function getSupportThread(messageId: string): Promise<{ message: SupportMessage; replies: SupportReply[] }> {
  const { data, error } = await supabase
    .from('contact_messages')
    .select('id, subject, message, created_at, source, support_replies(id, sender, body, created_at, read_at)')
    .eq('id', messageId)
    .single();
  if (error) throw error;
  const { support_replies, ...message } = data;
  const replies = [...(support_replies ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { message, replies };
}

export async function createSupportMessage(userId: string, subject: string, message: string): Promise<string> {
  // E-posta ve ad sunucuda hesaptan doldurulur (fill_support_message_identity tetikleyicisi);
  // NOT NULL kısıtı için yer tutucu gönderilir.
  const { data, error } = await supabase
    .from('contact_messages')
    .insert({ user_id: userId, source: 'app', subject, message, email: '', name: '' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function replyToSupportMessage(messageId: string, body: string): Promise<void> {
  const { error } = await supabase.from('support_replies').insert({ message_id: messageId, sender: 'user', body });
  if (error) throw error;
}

export interface SupportReplyNotification {
  id: string;
  messageId: string;
  subject: string;
  body: string;
  createdAt: string;
  read: boolean;
}

// Bildirimler ekranındaki "Destek" bölümü: destek ekibinin son cevapları (push ile aynı içerik).
// Okundu durumu cevabın kendisindedir; sohbet açılınca okundu işaretlenir.
export async function listSupportReplyNotifications(limit = 20): Promise<SupportReplyNotification[]> {
  const { data, error } = await supabase
    .from('support_replies')
    .select('id, message_id, body, created_at, read_at, contact_messages(subject)')
    .eq('sender', 'support')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    messageId: row.message_id,
    subject: row.contact_messages?.subject ?? '',
    body: row.body,
    createdAt: row.created_at,
    read: !!row.read_at,
  }));
}

export async function markSupportRepliesRead(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('support_replies')
    .update({ read_at: new Date().toISOString() })
    .eq('message_id', messageId)
    .eq('sender', 'support')
    .is('read_at', null);
  if (error) throw error;
}
