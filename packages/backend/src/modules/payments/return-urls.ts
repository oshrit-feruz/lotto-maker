import { config } from '../../config.js';
import { AppError } from '../../plugins/error-handler.js';

export interface ReturnUrls {
  /** Where the hosted checkout sends the user after paying. Gets `paymentId` added. */
  successUrl?: string;
  /** Where it sends the user after cancelling. Gets `paymentId` added. */
  cancelUrl?: string;
}

/** True when `url` is an http(s) URL on one of CHECKOUT_RETURN_ORIGINS, without credentials. */
export function isAllowedReturnUrl(url: string, allowed: readonly string[] = config.CHECKOUT_RETURN_ORIGINS): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  if (parsed.username || parsed.password) return false;
  return allowed.includes(parsed.origin);
}

/**
 * Checks both return URLs against the allowlist (422 INVALID_RETURN_URL otherwise) and adds
 * `paymentId` to each, so the site can poll GET /payments/:id when the user comes back.
 */
export function prepareReturnUrls(urls: ReturnUrls, paymentId: string): ReturnUrls {
  const out: ReturnUrls = {};
  for (const key of ['successUrl', 'cancelUrl'] as const) {
    const value = urls[key];
    if (value === undefined) continue;
    if (!isAllowedReturnUrl(value)) {
      throw new AppError(422, 'INVALID_RETURN_URL', `${key} must be on an allowed origin`, { field: key });
    }
    const url = new URL(value);
    url.searchParams.set('paymentId', paymentId);
    out[key] = url.toString();
  }
  return out;
}
