// OCR'ın ayrı ayrı okuduğu tarafları (keşideci/lehtar, satıcı/alıcı, gönderen/alıcı) çalışma alanının
// kendi adlarıyla karşılaştırıp yönü ve cariyi belirler. Sonuç kesin kayıt değildir; kullanıcı onay
// ekranında değiştirebilir. Ad bilinmiyorsa modelin sonucu olduğu gibi kalır.
export interface PartyDocument {
  documentType?: string | null;
  direction?: string | null;
  counterpartyName?: string | null;
  instrumentDetails?: { payerName?: string | null; payeeName?: string | null } | null;
  invoiceDetails?: { sellerName?: string | null; buyerName?: string | null } | null;
  receiptDetails?: { senderName?: string | null; recipientName?: string | null } | null;
}

export interface ResolvedParties {
  direction: string | null;
  counterpartyName: string | null;
  warning: { tr: string; en: string } | null;
}

const LEGAL_WORDS = new Set([
  'aş', 'as', 'ltd', 'limited', 'şti', 'sti', 'anonim', 'şirketi', 'sirketi', 'tic', 'ticaret',
  'san', 'sanayi', 'paz', 'pazarlama', 've', 'co', 'inc',
]);

function nameTokens(value: string | null | undefined): string[] {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\./g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token && !LEGAL_WORDS.has(token));
}

function containsRun(longer: string[], shorter: string[]): boolean {
  for (let start = 0; start + shorter.length <= longer.length; start += 1) {
    if (shorter.every((token, index) => longer[start + index] === token)) return true;
  }
  return false;
}

// Tek kelimelik ad ("Ahmet") yalnızca birebir eşleşir; "Ahmet Demir" gibi başka kişiler kendi adımız sayılmaz.
export function isOwnName(name: string | null | undefined, ownNames: readonly (string | null | undefined)[]): boolean {
  const target = nameTokens(name);
  if (target.length === 0) return false;
  return ownNames.some((own) => {
    const candidate = nameTokens(own);
    if (candidate.length === 0) return false;
    if (candidate.join(' ') === target.join(' ')) return true;
    const [longer, shorter] = candidate.length >= target.length ? [candidate, target] : [target, candidate];
    return shorter.length >= 2 && containsRun(longer, shorter);
  });
}

const present = (value: string | null | undefined): string | null => value?.trim() || null;

export function resolveDocumentParties(
  document: PartyDocument,
  ownNames: readonly (string | null | undefined)[]
): ResolvedParties {
  const direction = document.direction ?? null;
  const counterpartyName = document.counterpartyName ?? null;
  const unchanged: ResolvedParties = { direction, counterpartyName, warning: null };
  if (!ownNames.some((own) => nameTokens(own).length > 0)) return unchanged;
  const own = (name: string | null) => isOwnName(name, ownNames);

  if (document.documentType === 'cek' || document.documentType === 'senet') {
    const payer = present(document.instrumentDetails?.payerName);
    const payee = present(document.instrumentDetails?.payeeName);
    if (own(payer) && own(payee)) return unchanged;
    if (own(payer)) return { direction: 'payable', counterpartyName: payee ?? counterpartyName, warning: null };
    if (own(payee)) return { direction: 'receivable', counterpartyName: payer ?? counterpartyName, warning: null };
    if (!payer) return unchanged;
    const endorsed = document.documentType === 'cek' && payee !== null;
    return {
      direction: 'receivable',
      counterpartyName: payer,
      warning: endorsed
        ? {
            tr: `Çek "${payee}" adına düzenlenmiş; ciro edilmiş olabilir. Yön ve cariyi doğrulayın.`,
            en: `The cheque is payable to "${payee}" and may have been endorsed. Please verify the direction and counterparty.`,
          }
        : null,
    };
  }

  if (document.documentType === 'fatura') {
    const seller = present(document.invoiceDetails?.sellerName);
    const buyer = present(document.invoiceDetails?.buyerName);
    if (own(seller) && own(buyer)) return unchanged;
    if (own(seller)) {
      return { direction: direction === 'income' ? 'income' : 'receivable', counterpartyName: buyer ?? counterpartyName, warning: null };
    }
    if (own(buyer)) {
      return { direction: direction === 'receivable' || direction === 'income' ? 'payable' : direction, counterpartyName: seller ?? counterpartyName, warning: null };
    }
    return unchanged;
  }

  if (document.documentType === 'banka_dekontu') {
    const sender = present(document.receiptDetails?.senderName);
    const recipient = present(document.receiptDetails?.recipientName);
    if (own(sender) && own(recipient)) return { direction: 'transfer', counterpartyName, warning: null };
    if (own(sender)) return { direction: 'expense', counterpartyName: recipient ?? counterpartyName, warning: null };
    if (own(recipient)) return { direction: 'income', counterpartyName: sender ?? counterpartyName, warning: null };
  }
  return unchanged;
}
