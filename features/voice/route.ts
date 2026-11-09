// Sesli taslağı mevcut kayıt ekranlarına ön doldurma parametresi olarak verir; kaydı kullanıcı yapar.
export interface VoiceDraft {
  transcript: string;
  kind: 'obligation' | 'transaction' | 'payment' | 'unsupported';
  documentType: string | null;
  direction: string | null;
  amountMinor: number | null;
  currency: string;
  date: string | null;
  bank: string | null;
  documentNumber: string | null;
  counterpartyId: string | null;
  counterpartyName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  assetId: string | null;
  assetName: string | null;
  installments: number | null;
  lowConfidence: string[];
}

export interface VoiceRoute {
  pathname: '/obligations/new' | '/transactions/new' | '/payments/new';
  params: Record<string, string>;
}

function compact(params: Record<string, string | number | null | undefined>): Record<string, string> {
  const result: Record<string, string> = { voice: '1' };
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') result[key] = String(value);
  }
  return result;
}

export function voiceDraftRoute(
  draft: VoiceDraft,
  options: { bankCode?: string | null; title?: string | null; notes?: string | null } = {}
): VoiceRoute | null {
  const description = draft.transcript.slice(0, 200);
  if (draft.kind === 'obligation') {
    return {
      pathname: '/obligations/new',
      params: compact({
        type: draft.documentType,
        direction: draft.direction,
        amountMinor: draft.amountMinor,
        currency: draft.currency,
        dueDate: draft.date,
        counterpartyId: draft.counterpartyId,
        categoryId: draft.categoryId,
        assetId: draft.assetId,
        bankCode: options.bankCode,
        installmentCount: draft.installments,
        title: options.title,
        notes: options.notes,
      }),
    };
  }
  if (draft.kind === 'transaction') {
    return {
      pathname: '/transactions/new',
      params: compact({
        direction: draft.direction,
        amountMinor: draft.amountMinor,
        date: draft.date,
        counterpartyId: draft.counterpartyId,
        categoryId: draft.categoryId,
        assetId: draft.assetId,
        description,
      }),
    };
  }
  if (draft.kind === 'payment') {
    return {
      pathname: '/payments/new',
      params: compact({
        direction: draft.direction,
        amountMinor: draft.amountMinor,
        date: draft.date,
        counterpartyId: draft.counterpartyId,
        description,
      }),
    };
  }
  return null;
}
