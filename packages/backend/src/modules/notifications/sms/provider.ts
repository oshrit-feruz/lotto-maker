import { AppError } from '../../../plugins/error-handler.js';
import type { SmsProviderName } from './select.js';
import {
  DEFAULT_MAX_RESPONSE_BYTES,
  fetchBounded,
  HttpRequestFailure,
  type BoundedHttpResponse,
} from '../../../lib/http.js';

export type { SmsProviderName } from './select.js';

export interface SmsSendOptions {
  /** The body is a secret (an OTP): providers that print messages must not print it. */
  sensitive?: boolean;
}

/**
 * One SMS gateway. `send` resolves with the provider's message id once the provider accepted
 * the message, and throws otherwise. Implementations never log the recipient's message body,
 * and their error messages never contain the body, the credentials or the phone number.
 */
export interface SmsProvider {
  readonly name: SmsProviderName;
  send(to: string, body: string, opts?: SmsSendOptions): Promise<{ id: string }>;
}

/** The provider was reached (or timed out) but did not accept the message. Message is redacted. */
export class SmsProviderError extends Error {
  constructor(
    readonly provider: SmsProviderName,
    readonly reason: string,
  ) {
    super(`SMS_PROVIDER_ERROR: ${provider} ${reason}`);
    this.name = 'SmsProviderError';
  }
}

export function notConfigured(provider: SmsProviderName, missing: string[]): AppError {
  // The variable names are safe to show; their values are never included.
  console.error(`[sms] ${provider} is selected but not configured: missing ${missing.join(', ')}`);
  return new AppError(503, 'SMS_NOT_CONFIGURED', 'SMS provider is not configured');
}

export const DEFAULT_SMS_TIMEOUT_MS = 10_000;

/** What a provider sees of the HTTP response: the body is already read (and bounded). */
export type SmsHttpResponse = BoundedHttpResponse;

export const MAX_SMS_RESPONSE_BYTES = DEFAULT_MAX_RESPONSE_BYTES;

/**
 * fetchBounded (src/lib/http.ts) with its failures reported as SmsProviderError: a timeout or
 * network failure carries no request details (the URL carries no secret, the body does).
 */
export async function fetchWithTimeout(
  provider: SmsProviderName,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maxBytes = MAX_SMS_RESPONSE_BYTES,
): Promise<SmsHttpResponse> {
  try {
    return await fetchBounded(url, init, timeoutMs, maxBytes);
  } catch (err) {
    if (err instanceof HttpRequestFailure) throw new SmsProviderError(provider, err.reason);
    throw err;
  }
}

/**
 * Israeli gateways take local numbers ("05XXXXXXXX"), not E.164. Only +972 numbers are
 * accepted: anything else throws, so a foreign number never goes out under a wrong prefix.
 */
export function toIsraeliLocal(provider: SmsProviderName, e164: string): string {
  const m = /^\+972(\d{8,9})$/.exec(e164);
  if (!m) throw new SmsProviderError(provider, 'unsupported destination (only +972 numbers)');
  return `0${m[1]}`;
}
