import {
  DEFAULT_SMS_TIMEOUT_MS,
  fetchWithTimeout,
  notConfigured,
  readText,
  SmsProviderError,
  toIsraeliLocal,
  type SmsProvider,
} from './provider.js';

export const SMS019_URL = 'https://019sms.co.il/api';

export interface Sms019Options {
  username?: string;
  apiToken?: string;
  /** Digits without "+" or English letters, at most 11 characters; must be verified by 019. */
  sender?: string;
  /** https://019sms.co.il/api (default), or https://019sms.co.il/api/test which sends nothing. */
  apiUrl?: string;
  timeoutMs?: number;
}

/** Error codes from https://docs.019sms.co.il/sms/errors-and-status.html#error-codes */
const SMS019_STATUS: Record<number, string> = {
  1: 'could not parse request',
  2: 'missing field',
  3: 'bad username or invalid token',
  4: 'not enough credit',
  5: 'no permission to send at this time',
  6: 'process failure',
  8: 'all numbers blocked',
  9: 'destination too short or too long',
  10: 'expired token',
  11: 'token does not match username',
  12: 'not enough money',
  50: 'IP not permitted',
  429: 'too many requests',
  515: 'unverified source',
  989: 'message too long or too short',
  992: 'source too long or too short',
  998: 'unknown error',
  999: 'contact support',
};

/**
 * 019 SMS JSON API: POST https://019sms.co.il/api with `Authorization: Bearer <token>` and
 * `{ sms: { user: { username }, source, destinations: { phone: [{ _: "05…" }] }, message } }`.
 * Reply `{ status: 0, message: "SMS will be sent", shipment_id }` on success; a non-zero
 * `status` is an error code.
 * Sources: https://docs.019sms.co.il/sms/send-sms.html, https://docs.019sms.co.il/guide/
 */
export class Sms019Provider implements SmsProvider {
  readonly name = 'sms019' as const;
  constructor(private readonly opts: Sms019Options) {}

  buildBody(to: string, body: string): unknown {
    return {
      sms: {
        user: { username: this.opts.username },
        source: this.opts.sender,
        destinations: { phone: [{ _: toIsraeliLocal(this.name, to) }] },
        message: body,
      },
    };
  }

  async send(to: string, body: string): Promise<{ id: string }> {
    const { username, apiToken, sender } = this.opts;
    const missing = [!username && 'SMS019_USERNAME', !apiToken && 'SMS019_TOKEN', !sender && 'SMS_SENDER'].filter(
      (v): v is string => Boolean(v),
    );
    if (missing.length > 0) throw notConfigured(this.name, missing);

    const res = await fetchWithTimeout(
      this.name,
      this.opts.apiUrl ?? SMS019_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(this.buildBody(to, body)),
      },
      this.opts.timeoutMs ?? DEFAULT_SMS_TIMEOUT_MS,
    );
    const text = await readText(res);
    if (!res.ok) throw new SmsProviderError(this.name, `HTTP ${res.status}`);
    let json: { status?: unknown; shipment_id?: unknown };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      throw new SmsProviderError(this.name, 'unexpected response (not JSON)');
    }
    const status = Number(json.status);
    if (json.status === undefined || Number.isNaN(status)) {
      throw new SmsProviderError(this.name, 'unexpected response (no status)');
    }
    if (status !== 0) {
      throw new SmsProviderError(this.name, `status ${status}${SMS019_STATUS[status] ? ` (${SMS019_STATUS[status]})` : ''}`);
    }
    return { id: json.shipment_id !== undefined ? String(json.shipment_id) : '' };
  }
}
