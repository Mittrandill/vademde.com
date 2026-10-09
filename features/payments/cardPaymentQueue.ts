import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { supabase } from '@/services/supabase';
import { recordCardPayment, type RecordCardPaymentInput } from './api';

export type CardPaymentDraft = Omit<RecordCardPaymentInput, 'requestId' | 'actorId'>;
export interface StoredCardPayment {
  version: 1;
  userId: string;
  state: 'pending' | 'confirmed';
  input: RecordCardPaymentInput;
}

// Separate from the query cache. Never clear on logout, cache invalidation or user switch.
const operations = new Map<string, Promise<unknown>>();
const keyFor = (userId: string, workspaceId: string, cardId: string) =>
  `vademde-card-payment-v1:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}:${encodeURIComponent(cardId)}`;

function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const next = (operations.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
  operations.set(key, next);
  void next.finally(() => { if (operations.get(key) === next) operations.delete(key); }).catch(() => undefined);
  return next;
}

async function assertOwner(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  // Only local queue ownership; server authorization still comes from RPC/RLS.
  if (!userId || data.session?.user.id !== userId) throw new Error('Oturum değişti. Ödemeyi kendi hesabınızla tekrar kontrol edin.');
}

function fingerprint(input: CardPaymentDraft): string {
  return JSON.stringify([input.workspaceId, input.cardAccountId, input.sourceAccountId,
    input.amountMinor, input.currencyCode, input.paidAt]);
}

async function read(userId: string, workspaceId: string, cardId: string): Promise<StoredCardPayment | null> {
  const raw = await AsyncStorage.getItem(keyFor(userId, workspaceId, cardId));
  if (raw === null) return null;
  let record: StoredCardPayment;
  try { record = JSON.parse(raw); } catch { throw new Error('Saklanan ödeme okunamadı. Yeni ödeme yapmadan işlem geçmişini kontrol edin.'); }
  const input = record?.input;
  if (record?.version !== 1 || record.userId !== userId || !['pending', 'confirmed'].includes(record.state)
    || !input || input.actorId !== userId || input.workspaceId !== workspaceId || input.cardAccountId !== cardId
    || typeof input.sourceAccountId !== 'string' || !input.sourceAccountId
    || typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)
    || !Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0
    || typeof input.currencyCode !== 'string' || !input.currencyCode
    || typeof input.paidAt !== 'string' || !Number.isFinite(Date.parse(input.paidAt))) {
    throw new Error('Saklanan ödeme bilgisi geçersiz. Yeni ödeme yapmadan işlem geçmişini kontrol edin.');
  }
  return record;
}

export async function loadStoredCardPayment(userId: string, workspaceId: string, cardId: string) {
  await assertOwner(userId);
  return read(userId, workspaceId, cardId);
}

export function submitDurableCardPayment(userId: string, draft: CardPaymentDraft): Promise<StoredCardPayment> {
  const key = keyFor(userId, draft.workspaceId, draft.cardAccountId);
  return serialize(key, async () => {
    await assertOwner(userId);
    let record = await read(userId, draft.workspaceId, draft.cardAccountId);
    if (record && fingerprint(record.input) !== fingerprint(draft)) {
      throw new Error('Önce bu kartın önceki ödeme sonucunu kontrol edin. Bekleyen işlem değiştirilmez.');
    }
    if (record?.state === 'confirmed') return record;
    if (!record) {
      if (!Number.isSafeInteger(draft.amountMinor) || draft.amountMinor <= 0
        || typeof draft.paidAt !== 'string' || !Number.isFinite(Date.parse(draft.paidAt))
        || [draft.workspaceId, draft.cardAccountId, draft.sourceAccountId, draft.currencyCode]
          .some((value) => typeof value !== 'string' || !value)
        || draft.cardAccountId === draft.sourceAccountId) {
        throw new Error('Ödeme hesabı, tutarı veya tarihi geçersiz');
      }
      record = { version: 1, userId, state: 'pending', input: { ...draft, actorId: userId, requestId: randomUUID() } };
      // Fail closed: no network write until the durable ID AND original payload are saved.
      await AsyncStorage.setItem(key, JSON.stringify(record));
    }
    await assertOwner(userId);
    await recordCardPayment(record.input);
    const confirmed: StoredCardPayment = { ...record, state: 'confirmed' };
    // If this write fails, pending remains and the next attempt safely replays the same ID.
    await AsyncStorage.setItem(key, JSON.stringify(confirmed));
    return confirmed;
  });
}

// Only explicit "new payment" acknowledgement can remove a confirmed local receipt.
// Pending/uncertain requests cannot be discarded or silently replaced.
export function acknowledgeCardPayment(userId: string, workspaceId: string, cardId: string): Promise<void> {
  const key = keyFor(userId, workspaceId, cardId);
  return serialize(key, async () => {
    await assertOwner(userId);
    const record = await read(userId, workspaceId, cardId);
    if (record?.state !== 'confirmed') throw new Error('Sonucu belirsiz ödeme silinemez. Önce aynı işlemi kontrol edin.');
    await AsyncStorage.removeItem(key);
  });
}
