// OCR ve sesli kayıttan gelen adın kayıtlı carilerle eşleştirilmesi. Belirsiz durumda hiçbiri
// seçilmez; yanlış cariye bağlamaktansa kullanıcının seçmesi tercih edilir.
const LEGAL_SUFFIX_PATTERN =
  /(^|\s)(a\.?ş\.?|ltd\.?|şti\.?|limited|anonim|şirketi|tic\.?|ticaret|san\.?|sanayi|paz\.?|pazarlama|co\.?|inc\.?)(?=\s|$)/g;

export function normalizeCounterpartyName(name: string): string {
  const spaced = name.toLocaleLowerCase('tr-TR').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced
    .replace(LEGAL_SUFFIX_PATTERN, ' ')
    .replace(LEGAL_SUFFIX_PATTERN, ' ')
    .replace(/[.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const digits = (value: string | null | undefined) => String(value ?? '').replace(/\D/g, '');

export interface MatchableCounterparty {
  id: string;
  name: string;
  tax_number?: string | null;
}

export function matchCounterparty(
  input: { name?: string | null; taxNumber?: string | null },
  counterparties: readonly MatchableCounterparty[]
): string | null {
  const taxNumber = digits(input.taxNumber);
  if (taxNumber.length >= 10) {
    const byTax = counterparties.filter((item) => digits(item.tax_number) === taxNumber);
    if (byTax.length === 1) return byTax[0]!.id;
  }
  const target = normalizeCounterpartyName(input.name ?? '');
  if (!target) return null;
  const exact = counterparties.filter((item) => normalizeCounterpartyName(item.name) === target);
  if (exact.length === 1) return exact[0]!.id;
  if (exact.length > 1 || target.length < 3) return null;
  const similar = counterparties.filter((item) => {
    const candidate = normalizeCounterpartyName(item.name);
    return candidate.length >= 3 && (candidate.includes(target) || target.includes(candidate));
  });
  return similar.length === 1 ? similar[0]!.id : null;
}

const COMPANY_PATTERN =
  /(^|[\s.,])(a\.?ş\.?|ltd\.?|şti\.?|limited|anonim|şirketi|ticaret|sanayi|holding|kooperatifi|inc\.?|llc|gmbh)(?=[\s.,]|$)/i;

export function guessCounterpartyType(name: string): 'individual' | 'company' {
  return COMPANY_PATTERN.test(name.toLocaleLowerCase('tr-TR')) ? 'company' : 'individual';
}
