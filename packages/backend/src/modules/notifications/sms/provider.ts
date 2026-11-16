import { AppError } from '../../../plugins/error-handler.js';
import type { SmsProviderName } from './select.js';

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

/**
 * fetch with a hard timeout. A timeout or network failure becomes an SmsProviderError without
 * the request details (the URL can carry no secret, but the body does).
 */
export async function fetchWithTimeout(
  provider: SmsProviderName,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new SmsProviderError(provider, `timeout after ${timeoutMs}ms`);
    const kind = err instanceof Error ? err.name : 'unknown';
    throw new SmsProviderError(provider, `network error (${kind})`);
  } finally {
    clearTimeout(timer);
  }
}

/** Reads a response body as text, bounded so a huge error page cannot blow up memory. */
export async function readText(res: Response, max = 64 * 1024): Promise<string> {
  const text = await res.text().catch(() => '');
  return text.length > max ? text.slice(0, max) : text;
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
