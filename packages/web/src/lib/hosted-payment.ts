/**
 * The hosted card page (Hyp / CreditGuard) shown in an iframe on the checkout page, and the
 * parameters it puts on the return URL. The backend verifies those parameters itself
 * (POST /payments/return): the page never decides on its own that a payment succeeded.
 */

/** Hosts the iframe may load: the gateway's hosted pages, https only. */
const HOSTED_PAGE_HOST = /(^|\.)creditguard\.co\.il$/;

export function isEmbeddablePaymentUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOSTED_PAGE_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

const RESULT_KEYS = new Set([
  'txId',
  'uniqueID',
  'uniqueId',
  'lang',
  'authNumber',
  'cgUid',
  'responseMac',
  'responseMAC',
  'cardToken',
  'cardExp',
  'personalId',
  'cardMask',
  'numberOfPayments',
  'firstPayment',
  'periodicalPayment',
  'errorCode',
  'errorText',
]);

/**
 * The hosted page's result parameters from the return URL, or null when there are none (the
 * mock provider, or a provider that reports only by webhook).
 */
export function hostedResultParams(params: URLSearchParams): Record<string, string> | null {
  if (!params.get('txId')) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of params) if (RESULT_KEYS.has(k) && v.length <= 1024) out[k] = v;
  return out;
}

/** Our payment id: the backend's `paymentId` on the return URL, else Hyp's `uniqueID` (the same id). */
export function returnedPaymentId(params: URLSearchParams): string | null {
  const id = /^[A-Za-z0-9_-]{1,64}$/;
  for (const key of ['paymentId', 'uniqueID', 'uniqueId']) {
    const v = params.get(key);
    if (v && id.test(v)) return v;
  }
  return null;
}
