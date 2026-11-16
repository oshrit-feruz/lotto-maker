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

/** What a provider sees of the HTTP response: the body is already read (and bounded). */
export interface SmsHttpResponse {
  ok: boolean;
  status: number;
  text: string;
}

export const MAX_SMS_RESPONSE_BYTES = 64 * 1024;

/**
 * POSTs with a hard timeout that covers the whole exchange, response body included, so a
 * gateway that sends headers and then stalls cannot hold an OTP request open. The body is read
 * incrementally and the read is cancelled past `maxBytes`. A timeout or network failure becomes
 * an SmsProviderError without the request details (the URL carries no secret, the body does).
 */
export async function fetchWithTimeout(
  provider: SmsProviderName,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maxBytes = MAX_SMS_RESPONSE_BYTES,
): Promise<SmsHttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await readBounded(res, maxBytes);
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    if (controller.signal.aborted) throw new SmsProviderError(provider, `timeout after ${timeoutMs}ms`);
    const kind = err instanceof Error ? err.name : 'unknown';
    throw new SmsProviderError(provider, `network error (${kind})`);
  } finally {
    clearTimeout(timer);
  }
}

/** Reads at most `maxBytes` of the body, then cancels the stream. */
async function readBounded(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = maxBytes - size;
      if (value.byteLength >= room) {
        chunks.push(value.subarray(0, room));
        size = maxBytes;
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
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
