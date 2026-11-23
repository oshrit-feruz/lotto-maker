import { randomUUID } from 'crypto';
import { xmlEscape } from '../../../lib/http.js';
import {
  DEFAULT_SMS_TIMEOUT_MS,
  fetchWithTimeout,
  notConfigured,
  SmsProviderError,
  toIsraeliLocal,
  type SmsProvider,
} from './provider.js';

export const INFORU_URL = 'https://api.inforu.co.il/SendMessageXml.ashx';

export interface InforuOptions {
  username?: string;
  apiToken?: string;
  /** Up to 11 Latin characters (no spaces) or up to 14 digits; must be approved by InforU. */
  sender?: string;
  timeoutMs?: number;
}

/** Status codes from the InforU SMS API document (v6.1, "Response Status Codes"). */
const INFORU_STATUS: Record<string, string> = {
  '-1': 'failed',
  '-2': 'bad username or token',
  '-6': 'no recipients',
  '-9': 'no message text',
  '-11': 'illegal XML',
  '-13': 'user quota exceeded',
  '-14': 'project quota exceeded',
  '-15': 'customer quota exceeded',
  '-18': 'no valid recipients',
  '-20': 'invalid sender number',
  '-21': 'invalid sender name',
  '-22': 'user blocked',
  '-26': 'authentication error',
  '-90': 'invalid sender identification',
  '-94': 'sender ID not in allow list',
};

/**
 * InforU (InforUMobile) XML API: POST https://api.inforu.co.il/SendMessageXml.ashx, UTF-8,
 * form field `InforuXML=<url-encoded XML>`. Credentials go inside the XML (User/Username,
 * User/ApiToken). The reply is `<Result><Status>1</Status>…` on success, a negative Status on
 * error. The reply carries no message id, so we set Settings/CustomerMessageID and return it.
 * Source: https://www.inforu.co.il/wp-content/uploads/2020/12/SMS_API-6.1.pdf
 */
export class InforuSmsProvider implements SmsProvider {
  readonly name = 'inforu' as const;
  constructor(private readonly opts: InforuOptions) {}

  buildXml(to: string, body: string, messageId: string): string {
    const { username, apiToken, sender } = this.opts;
    return (
      '<Inforu>' +
      `<User><Username>${xmlEscape(username!)}</Username><ApiToken>${xmlEscape(apiToken!)}</ApiToken></User>` +
      `<Content Type="sms"><Message>${xmlEscape(body)}</Message></Content>` +
      `<Recipients><PhoneNumber>${xmlEscape(toIsraeliLocal(this.name, to))}</PhoneNumber></Recipients>` +
      `<Settings><Sender>${xmlEscape(sender!)}</Sender><CustomerMessageID>${xmlEscape(messageId)}</CustomerMessageID></Settings>` +
      '</Inforu>'
    );
  }

  async send(to: string, body: string): Promise<{ id: string }> {
    const { username, apiToken, sender } = this.opts;
    const missing = [!username && 'INFORU_USERNAME', !apiToken && 'INFORU_TOKEN', !sender && 'SMS_SENDER'].filter(
      (v): v is string => Boolean(v),
    );
    if (missing.length > 0) throw notConfigured(this.name, missing);

    const messageId = randomUUID();
    const xml = this.buildXml(to, body, messageId);
    const res = await fetchWithTimeout(
      this.name,
      INFORU_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
        body: new URLSearchParams({ InforuXML: xml }).toString(),
      },
      this.opts.timeoutMs ?? DEFAULT_SMS_TIMEOUT_MS,
    );
    const { text } = res;
    if (!res.ok) throw new SmsProviderError(this.name, `HTTP ${res.status}`);
    const status = /<Status>\s*(-?\d+)\s*<\/Status\s*>/i.exec(text)?.[1];
    if (status === undefined) throw new SmsProviderError(this.name, 'unexpected response (no Status)');
    if (status !== '1') {
      throw new SmsProviderError(this.name, `status ${status}${INFORU_STATUS[status] ? ` (${INFORU_STATUS[status]})` : ''}`);
    }
    return { id: messageId };
  }
}
