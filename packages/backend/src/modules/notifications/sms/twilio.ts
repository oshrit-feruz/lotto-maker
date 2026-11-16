import {
  DEFAULT_SMS_TIMEOUT_MS,
  fetchWithTimeout,
  notConfigured,
  SmsProviderError,
  type SmsProvider,
} from './provider.js';

export interface TwilioOptions {
  accountSid?: string;
  authToken?: string;
  /** E.164 number or an alphanumeric sender ID approved for the destination country. */
  from?: string;
  timeoutMs?: number;
}

/**
 * Twilio Programmable Messaging over its REST API (no SDK):
 * POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json, HTTP Basic
 * (AccountSid:AuthToken), form body To / From / Body. 201 with `sid` on success; 4xx/5xx with
 * `{ code, message }` on error.
 * https://www.twilio.com/docs/messaging/api/message-resource#create-a-message-resource
 */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio' as const;
  constructor(private readonly opts: TwilioOptions) {}

  async send(to: string, body: string): Promise<{ id: string }> {
    const { accountSid, authToken, from } = this.opts;
    const missing = [
      !accountSid && 'TWILIO_ACCOUNT_SID',
      !authToken && 'TWILIO_AUTH_TOKEN',
      !from && 'TWILIO_FROM_NUMBER (or SMS_SENDER)',
    ].filter((v): v is string => Boolean(v));
    if (missing.length > 0) throw notConfigured(this.name, missing);

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid!)}/Messages.json`;
    const res = await fetchWithTimeout(
      this.name,
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({ To: to, From: from!, Body: body }).toString(),
      },
      this.opts.timeoutMs ?? DEFAULT_SMS_TIMEOUT_MS,
    );
    const { text } = res;
    let json: { sid?: unknown; code?: unknown } = {};
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      // Twilio's numeric error code is enough to look the failure up; its message can echo the number.
      const code = typeof json.code === 'number' ? ` code ${json.code}` : '';
      throw new SmsProviderError(this.name, `HTTP ${res.status}${code}`);
    }
    if (typeof json.sid !== 'string') throw new SmsProviderError(this.name, 'unexpected response (no sid)');
    return { id: json.sid };
  }
}
