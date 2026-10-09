import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { supabase } from '@/services/supabase';
import { settleObligations, type SettleObligationsInput, type SettleObligationsResult } from './api';

export interface StoredOffset {
  version: 1;
  userId: string;
  state: 'pending' | 'confirmed' | 'cancelled' | 'reversing' | 'reversed';
  input: SettleObligationsInput;
  result?: SettleObligationsResult;
}
const work = new Map<string, Promise<unknown>>();
const storageKey = (userId: string, workspaceId: string) =>
  `vademde-offset-v1:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}`;
function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const next = (work.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
  work.set(key, next);
  void next.finally(() => { if (work.get(key) === next) work.delete(key); }).catch(() => undefined);
  return next;
}
async function assertOwner(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!userId || data.session?.user.id !== userId) throw new Error('Mahsup kuyruğunun sahibiyle giriş yapın');
}
function validate(input: SettleObligationsInput) {
  if (!input || input.method !== 'mahsup' || !['payable', 'receivable'].includes(input.direction)
    || [input.workspaceId, input.counterpartyId, input.currencyCode].some((x) => typeof x !== 'string' || !x)
    || !Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0
    || typeof input.paidAt !== 'string' || !Number.isFinite(Date.parse(input.paidAt))
    || !Array.isArray(input.targets) || !input.targets.length || !Array.isArray(input.sources) || !input.sources.length
    || [...input.targets, ...input.sources].some((x) => !x || typeof x.id !== 'string' || !x.id
      || !Number.isSafeInteger(x.remaining_amount_minor) || x.remaining_amount_minor <= 0)
    || new Set([...input.targets, ...input.sources].map((x) => x.id)).size !== input.targets.length + input.sources.length) {
    throw new Error('Mahsup bilgileri geçersiz; kayıtları kontrol edin');
  }
}
function fingerprint(input: SettleObligationsInput) {
  return JSON.stringify([input.workspaceId, input.counterpartyId, input.direction, input.currencyCode,
    input.amountMinor, input.paidAt, input.fxRateTryMinor ?? null,
    input.targets.map((x) => [x.id, x.remaining_amount_minor]),
    input.sources?.map((x) => [x.id, x.remaining_amount_minor])]);
}
async function read(userId: string, workspaceId: string): Promise<StoredOffset | null> {
  const raw = await AsyncStorage.getItem(storageKey(userId, workspaceId));
  if (raw === null) return null;
  try {
    const record: StoredOffset = JSON.parse(raw);
    validate(record.input);
    if (record.version !== 1 || record.userId !== userId || record.input.actorId !== userId
      || record.input.workspaceId !== workspaceId || !['pending', 'confirmed', 'cancelled', 'reversing', 'reversed'].includes(record.state)
      || typeof record.input.requestId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.input.requestId)
      || (['confirmed', 'reversing'].includes(record.state) && !Array.isArray(record.result?.allocations))) throw new Error();
    return record;
  } catch { throw new Error('Saklanan mahsup okunamadı. Yeni işlem yapmadan kayıt geçmişini kontrol edin.'); }
}
export async function loadStoredOffset(userId: string, workspaceId: string) {
  await assertOwner(userId);
  return read(userId, workspaceId);
}
export function submitDurableOffset(userId: string, draft: SettleObligationsInput): Promise<SettleObligationsResult> {
  const key = storageKey(userId, draft.workspaceId);
  return serialize(key, async () => {
    await assertOwner(userId);
    validate(draft);
    let record = await read(userId, draft.workspaceId);
    if (record && fingerprint(record.input) !== fingerprint(draft)) throw new Error('Önce önceki mahsup sonucunu kontrol edin');
    if (record?.state === 'cancelled') throw new Error('Mahsup iptal edildi. Yeni işlem başlat seçeneğini kullanın.');
    if (record?.state === 'reversed') throw new Error('Mahsup geri alındı. Yeni işlem başlat seçeneğini kullanın.');
    if (record?.state === 'reversing') throw new Error('Önce bekleyen mahsup geri alma sonucunu kontrol edin');
    if (record?.state === 'confirmed') return record.result!;
    if (!record) {
      record = { version: 1, userId, state: 'pending', input: { ...draft, actorId: userId, requestId: randomUUID() } };
      // Preserve full original allocation snapshots BEFORE any financial network write.
      await AsyncStorage.setItem(key, JSON.stringify(record));
    }
    await assertOwner(userId);
    const result = await settleObligations(record.input);
    await AsyncStorage.setItem(key, JSON.stringify({ ...record, state: 'confirmed', result }));
    return result;
  });
}
export function acknowledgeOffset(userId: string, workspaceId: string): Promise<void> {
  const key = storageKey(userId, workspaceId);
  return serialize(key, async () => {
    await assertOwner(userId);
    const record = await read(userId, workspaceId);
    if (!record || record.state === 'pending' || record.state === 'reversing') throw new Error('Sonucu belirsiz mahsup silinemez');
    await AsyncStorage.removeItem(key);
  });
}

export function cancelStoredOffset(userId: string, workspaceId: string): Promise<StoredOffset> {
  const key = storageKey(userId, workspaceId);
  return serialize(key, async () => {
    await assertOwner(userId);
    const record = await read(userId, workspaceId);
    if (!record) throw new Error('Saklanan mahsup yok');
    if (record.state !== 'pending') return record;
    const { data, error } = await supabase.rpc('cancel_offset_request' as never, {
      p_expected_actor: userId, p_workspace_id: workspaceId, p_request_id: record.input.requestId,
    } as never);
    if (error) throw error;
    const outcome = data as unknown as { state?: string } | null;
    let finalRecord: StoredOffset;
    if (outcome?.state === 'cancelled') finalRecord = { ...record, state: 'cancelled' };
    else if (outcome?.state === 'reversed') finalRecord = { ...record, state: 'reversed' };
    else if (outcome?.state === 'confirmed') {
      // Recover the original receipt; never undo a committed financial operation here.
      const result = await settleObligations(record.input);
      finalRecord = { ...record, state: 'confirmed', result };
    } else throw new Error('Mahsup iptal sonucu doğrulanamadı; aynı işlemi tekrar kontrol edin');
    await AsyncStorage.setItem(key, JSON.stringify(finalRecord));
    return finalRecord;
  });
}

export function reverseStoredOffset(userId: string, workspaceId: string): Promise<StoredOffset> {
  const key = storageKey(userId, workspaceId);
  return serialize(key, async () => {
    await assertOwner(userId);
    const record = await read(userId, workspaceId);
    if (!record || record.state === 'pending' || record.state === 'cancelled') throw new Error('Önce mahsup sonucunu doğrulayın');
    if (record.state === 'reversed') return record;
    if (record.state === 'confirmed') {
      // Persist reversal intent before the network call; lost responses cannot unlock a new operation.
      await AsyncStorage.setItem(key, JSON.stringify({ ...record, state: 'reversing' }));
    }
    await assertOwner(userId);
    const { data, error } = await supabase.rpc('reverse_offset_atomic' as never, {
      p_expected_actor: userId, p_workspace_id: workspaceId, p_request_id: record.input.requestId,
    } as never);
    if (error) throw error;
    if ((data as unknown as { state?: string } | null)?.state !== 'reversed') throw new Error('Mahsup geri alma sonucu doğrulanamadı');
    const reversed: StoredOffset = { ...record, state: 'reversed' };
    await AsyncStorage.setItem(key, JSON.stringify(reversed));
    return reversed;
  });
}
