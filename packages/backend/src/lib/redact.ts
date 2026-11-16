/**
 * Log redaction. Everything the API or the jobs log goes through `redactDeep` (pino's log
 * formatter) or `redactString` (console output routed to the logger), so a secret that ends up in
 * a log line by accident is masked rather than shipped to the log store.
 *
 * Keys are matched case-insensitively with `-` and `_` ignored, so `idNumber`, `id_number` and
 * `ID-NUMBER` are the same key.
 */

export const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set(
  [
    // auth
    'authorization',
    'cookie',
    'set-cookie',
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'jwt',
    'secret',
    'apiKey',
    // OTP codes. Not the bare key `code`: error codes (P2002, INSUFFICIENT_BALANCE) use it.
    'otp',
    'otpCode',
    'verificationCode',
    // ID numbers (plain and the at-rest forms)
    'idNumber',
    'idNumberEnc',
    'idNumberHash',
    'idNumberLegacy',
    'nationalId',
    // cards
    'cardToken',
    'providerToken',
    'cardNumber',
    'pan',
    'cvv',
    'cvc',
    // payment webhook signatures
    'signature',
    'x-mock-signature',
    'x-signature',
  ].map(normalizeKey),
);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, '');
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalizeKey(key));
}

// A bearer token anywhere in a string, a `token=` / `code=` query parameter (the operator SSE
// stream takes its JWT in the query), and a standalone 9-digit number (an Israeli ID number).
const BEARER = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi;
const QUERY_SECRET = /([?&](?:token|access_token|refresh_token|code|otp)=)[^&#\s"]*/gi;
const ID_NUMBER = /(?<![\w+])\d{9}(?!\w)/g;

export function redactString(value: string): string {
  return value
    .replace(BEARER, `$1 ${REDACTED}`)
    .replace(QUERY_SECRET, `$1${REDACTED}`)
    .replace(ID_NUMBER, REDACTED);
}

const MAX_DEPTH = 8;

/**
 * Returns a copy of `value` with sensitive keys masked and strings scrubbed. Errors keep their
 * name, message (scrubbed) and stack; cycles and very deep objects are cut off.
 */
export function redactDeep(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';
  seen.add(value);

  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      type: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
    for (const [k, v] of Object.entries(value)) {
      out[k] = isSensitiveKey(k) ? REDACTED : redactDeep(v, depth + 1, seen);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1, seen));
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = isSensitiveKey(k) ? REDACTED : redactDeep(v, depth + 1, seen);
  }
  return out;
}
