import { t } from '@/i18n';

// Query caches store stable codes; resolve labels when the screen renders.
export type ReceiptMatchReason =
  | 'installmentAmount'
  | 'remainingAmount'
  | 'openCounterparty'
  | 'counterpartyMatch'
  | 'counterpartySimilar';

const LEGACY_REASONS: Record<string, ReceiptMatchReason> = {
  'Taksit tutarı eşleşti': 'installmentAmount',
  'Kalan tutar eşleşti': 'remainingAmount',
  'Bu kişiyle açık kaydınız var': 'openCounterparty',
  'Karşı taraf eşleşti': 'counterpartyMatch',
  'Karşı taraf benziyor': 'counterpartySimilar',
};

export function receiptMatchReasonLabel(reason: ReceiptMatchReason | string): string {
  const code = LEGACY_REASONS[reason] ?? reason;
  switch (code) {
    case 'installmentAmount':
    case 'remainingAmount':
    case 'openCounterparty':
    case 'counterpartyMatch':
    case 'counterpartySimilar':
      return t(`receiptMatching.${code}`);
    default:
      return reason;
  }
}
