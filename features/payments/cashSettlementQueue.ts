import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { supabase } from '@/services/supabase';
import { prepareCashSettlement, settleObligations, validateCashDraft, validatePreparedCash,
  type SettleObligationsInput, type SettleObligationsResult } from './api';

export interface StoredCashSettlement {
  version: 1;
  userId: string;
  state: 'pending' | 'confirmed' | 'cancelled';
  input: SettleObligationsInput;
  result?: SettleObligationsResult;
}
// Financial intents are separate from the disposable query cache.
const work = new Map<string, Promise<unknown>>();
const keyFor = (userId: string, workspaceId: string) =>
  `vademde-cash-settlement-v1:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}`;
function serialize<T>(key: string, run: () => Promise<T>): Promise<T> {
  const next = (work.get(key) ?? Promise.resolve()).catch(() => undefined).then(run);
  work.set(key, next);
  void next.finally(() => { if (work.get(key) === next) work.delete(key); }).catch(() => undefined);
  return next;
}
async function assertOwner(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!userId || data.session?.user.id !== userId) throw new Error('Ödeme kuyruğunun sahibiyle giriş yapın');
}
function fingerprint(input: SettleObligationsInput) {
  return JSON.stringify([input.workspaceId, input.counterpartyId, input.direction, input.method,
    input.accountId, input.currencyCode, input.amountMinor, input.paidAt, input.fxRateTryMinor ?? null,
    input.categoryId ?? null, input.description?.trim() || null,
    input.targets.map((o) => [o.id, o.remaining_amount_minor, o.direction, o.currency_code, o.counterparty_id, o.category_id, o.title])]);
}
async function read(userId: string, workspaceId: string): Promise<StoredCashSettlement | null> {
  const raw = await AsyncStorage.getItem(keyFor(userId, workspaceId));
  if (raw === null) return null;
  try {
    const record: StoredCashSettlement = JSON.parse(raw);
    validatePreparedCash(record.input);
    if (record.version !== 1 || record.userId !== userId || record.input.actorId !== userId
      || record.input.workspaceId !== workspaceId || !['pending', 'confirmed', 'cancelled'].includes(record.state)
      || typeof record.input.requestId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.input.requestId)
      || (record.state === 'confirmed' && (!Array.isArray(record.result?.allocations) || !Array.isArray(record.result?.transactionIds)))) {
      throw new Error();
    }
    return record;
  } catch { throw new Error('Saklanan ödeme okunamadı. Yeni işlem yapmadan özgün ödeme sonucunu kontrol edin.'); }
}
export async function loadStoredCashSettlement(userId: string, workspaceId: string) {
  await assertOwner(userId);
  return read(userId, workspaceId);
}
export function submitDurableCashSettlement(userId: string, draft: SettleObligationsInput): Promise<SettleObligationsResult> {
  return serialize(keyFor(userId, draft.workspaceId), async () => {
    await assertOwner(userId);
    validateCashDraft(draft);
    let record = await read(userId, draft.workspaceId);
    if (record && fingerprint(record.input) !== fingerprint(draft)) throw new Error('Önce önceki ödeme sonucunu kontrol edin; bekleyen işlem değiştirilmez');
    if (record?.state === 'cancelled') throw new Error('Ödeme isteği iptal edildi; yeni işlem başlat seçeneğini kullanın');
    if (record?.state === 'confirmed') return record.result!;
    if (!record) {
      // Discard caller-supplied identity/payload. Allocate once, then save the COMPLETE payload.
      const input = { ...draft, actorId: userId, requestId: randomUUID(), cashPayload: await prepareCashSettlement(draft) };
      record = { version: 1, userId, state: 'pending', input };
      validatePreparedCash(input);
      await assertOwner(userId);
      await AsyncStorage.setItem(keyFor(userId, draft.workspaceId), JSON.stringify(record));
    }
    await assertOwner(userId);
    const result = await settleObligations(record.input);
    // If confirmation persistence fails, the original pending ID/slices remain for safe replay.
    await AsyncStorage.setItem(keyFor(userId, draft.workspaceId), JSON.stringify({ ...record, state: 'confirmed', result }));
    return result;
  });
}
export function acknowledgeCashSettlement(userId: string, workspaceId: string) {
  return serialize(keyFor(userId, workspaceId), async () => {
    await assertOwner(userId);
    const record = await read(userId, workspaceId);
    if (!record || record.state === 'pending') throw new Error('Sonucu belirsiz ödeme silinemez');
    await AsyncStorage.removeItem(keyFor(userId, workspaceId));
  });
}
export function cancelStoredCashSettlement(userId: string, workspaceId: string): Promise<StoredCashSettlement> {
  return serialize(keyFor(userId, workspaceId), async () => {
    await assertOwner(userId);
    const record = await read(userId, workspaceId);
    if (!record) throw new Error('Saklanan ödeme yok');
    if (record.state !== 'pending') return record;
    const { data, error } = await supabase.rpc('cancel_cash_settlement_request' as never, {
      p_expected_actor: userId, p_workspace_id: workspaceId, p_request_id: record.input.requestId,
    } as never);
    if (error) throw error;
    const state = (data as unknown as { state?: string } | null)?.state;
    let final: StoredCashSettlement;
    if (state === 'cancelled') final = { ...record, state: 'cancelled' };
    else if (state === 'confirmed') {
      await assertOwner(userId);
      final = { ...record, state: 'confirmed', result: await settleObligations(record.input) };
    } else throw new Error('Ödeme iptal sonucu doğrulanamadı; aynı işlemi tekrar kontrol edin');
    await AsyncStorage.setItem(keyFor(userId, workspaceId), JSON.stringify(final));
    return final;
  });
}
