import { supabase } from '@/services/supabase';
import type { Database } from '@/db/database.types';
import { fetchAll } from '@/services/fetchAll';

export type OwnedAsset = Database['public']['Tables']['owned_assets']['Row'];
export type AssetInput = Database['public']['Tables']['owned_assets']['Insert'];
export type AssetValuation =
  Database['public']['Tables']['asset_valuations']['Row'];
export type AssetActivity =
  Database['public']['Views']['asset_activity']['Row'];
export const ASSET_KINDS = [
  'home',
  'land',
  'field',
  'commercial',
  'vehicle',
  'other',
] as const;
export const ASSET_LABELS: Record<string, string> = {
  home: 'Ev',
  land: 'Arsa',
  field: 'Tarla',
  commercial: 'İş yeri',
  vehicle: 'Araç',
  other: 'Diğer',
};

export function assetShareValue(
  asset: Pick<OwnedAsset, 'estimated_value_minor' | 'ownership_bps'>,
): number | null {
  return asset.estimated_value_minor === null
    ? null
    : Number(
        (BigInt(asset.estimated_value_minor) * BigInt(asset.ownership_bps) +
          5000n) /
          10000n,
      );
}

export async function listAssets(workspaceId: string): Promise<OwnedAsset[]> {
  return fetchAll((from, to) =>
    supabase
      .from('owned_assets')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('id')
      .range(from, to),
  );
}

export async function getAsset(
  workspaceId: string,
  id: string,
): Promise<OwnedAsset> {
  const { data, error } = await supabase
    .from('owned_assets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function saveAsset(
  input: AssetInput,
  id?: string,
): Promise<OwnedAsset> {
  if (
    !input.name.trim() ||
    !ASSET_KINDS.includes(input.kind as (typeof ASSET_KINDS)[number])
  )
    throw new Error('Varlık adı ve türünü kontrol edin.');
  for (const amount of [
    input.estimated_value_minor,
    input.purchase_price_minor,
  ]) {
    if (amount != null && (!Number.isSafeInteger(amount) || amount < 0))
      throw new Error('Tutarı kontrol edin.');
  }
  for (const date of [input.valued_on, input.purchased_on]) {
    if (
      date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date)
    )
      throw new Error('Tarihi kontrol edin.');
  }
  const query = id
    ? supabase
        .from('owned_assets')
        .update(input)
        .eq('workspace_id', input.workspace_id)
        .eq('id', id)
    : supabase.from('owned_assets').insert(input);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data;
}

export async function archiveAsset(
  workspaceId: string,
  id: string,
  archived: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('owned_assets')
    .update({ is_archived: archived })
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .select('id')
    .single();
  if (error) throw error;
}

export async function getAssetDetails(workspaceId: string, id: string) {
  const [asset, history, activity, obligations] = await Promise.all([
    getAsset(workspaceId, id),
    fetchAll<AssetValuation>((from, to) =>
      supabase
        .from('asset_valuations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('asset_id', id)
        .order('recorded_at', { ascending: false })
        .order('id')
        .range(from, to),
    ),
    fetchAll<AssetActivity>((from, to) =>
      supabase
        .from('asset_activity')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('asset_id', id)
        .order('occurred_at', { ascending: false })
        .order('transaction_id')
        .range(from, to),
    ),
    fetchAll<Database['public']['Tables']['obligations']['Row']>((from, to) =>
      supabase
        .from('obligations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('asset_id', id)
        .order('id')
        .range(from, to),
    ),
  ]);
  return { asset, history, activity, obligations };
}

// Keep currencies separate. Estimates are not income; financing principal is not a cost.
export function assetActivityTotals(rows: AssetActivity[], year: number) {
  const totals: Record<
    string,
    { income: number; expense: number; principal: number }
  > = {};
  for (const row of rows) {
    if (
      new Date(row.occurred_at).getFullYear() !== year ||
      row.direction === 'transfer' ||
      row.description
        ?.toLocaleLowerCase('tr-TR')
        .startsWith('kredi kartı ekstresi')
    )
      continue;
    const total = (totals[row.currency_code] ??= {
      income: 0,
      expense: 0,
      principal: 0,
    });
    const principal = Math.min(
      row.amount_minor,
      Math.max(0, row.financing_minor),
    );
    if (row.direction === 'income')
      total.income += row.amount_minor - principal;
    if (row.direction === 'expense') {
      total.expense += row.amount_minor - principal;
      total.principal += principal;
    }
  }
  return totals;
}
