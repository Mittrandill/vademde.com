// Log satırlarını yönetim panelinde güvenle saklanabilecek hâle getirir: kimlik, e-posta, tarih ve
// jeton maskelenir, sorgu parametreleri atılır. Aynı hata tek kayıtta toplansın diye parmak izi
// maskelenmiş metinden üretilir.
export type ErrorSeverity = 'high' | 'medium' | 'low';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const DATE = /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?\b/g;
const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const LONG_NUMBER = /\b\d{5,}\b/g;
const SAFE_INVALID_VALUE = /^[a-z_-]+:<uuid>(?::(?:<date>|none))?$|^<uuid>$|^<date>$/;
const MAX_MESSAGE = 300;

export function maskLogMessage(raw: string): string {
  const masked = raw
    .slice(0, 2000)
    .replace(JWT, '<token>')
    .replace(UUID, '<uuid>')
    .replace(EMAIL, '<email>')
    .replace(DATE, '<date>')
    .replace(/(invalid input syntax for type [\w ]+: )"(.*)"/, (_m, prefix: string, value: string) =>
      `${prefix}"${SAFE_INVALID_VALUE.test(value) ? value : '<value>'}"`
    )
    .replace(LONG_NUMBER, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
  return masked.length > MAX_MESSAGE ? `${masked.slice(0, MAX_MESSAGE - 1)}…` : masked;
}

// "POST | 500 | https://x.supabase.co/functions/v1/ad?a=1 | ua" → "POST 500 /functions/v1/ad"
export function httpSummary(eventMessage: string): { status: string; message: string } | null {
  const match = /^(\w+) \| (\d{3}) \| (https?:\/\/\S+)/.exec(eventMessage);
  if (!match) return null;
  let path: string;
  try {
    path = new URL(match[3]).pathname;
  } catch {
    return null;
  }
  return { status: match[2], message: maskLogMessage(`${match[1]} ${match[2]} ${path}`) };
}

export function classifyError(input: { code: string; postgresSeverity?: string; message: string }): ErrorSeverity {
  const { code, postgresSeverity, message } = input;
  if (/supabase_migrations/.test(message)) return 'low';
  if (postgresSeverity === 'FATAL' || postgresSeverity === 'PANIC') return 'high';
  if (/^5\d\d$/.test(code)) return 'high';
  if (code === 'function_error') return 'high';
  if (/^(XX|53|57|58|22|23|27|40)/.test(code)) return 'high';
  return 'medium';
}

export async function fingerprint(source: string, code: string, message: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${source}|${code}|${message}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
