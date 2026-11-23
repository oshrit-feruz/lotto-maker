import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { AppError } from '../../../plugins/error-handler.js';
import { fetchBounded, HttpRequestFailure } from '../../../lib/http.js';
import type {
  CardChargeResult,
  CardCreditResult,
  CheckoutOptions,
  CheckoutReturnUrls,
  CheckoutSession,
  PaymentProvider,
  ProviderPaymentStatus,
  WebhookEvent,
} from '../payment-provider.js';
import { ashraitRequest, decodeXmlText, xmlBlocks, xmlField, type XmlFields } from './hyp-xml.js';

/**
 * Hyp Enterprise (formerly CreditGuard), the gateway behind pps.creditguard.co.il.
 *
 * Every call is an HTTPS POST to the XML relay (`.../xpo/Relay`), form-encoded with `user`,
 * `password` and `int_in` (the `<ashrait>` request). Sources:
 *  - https://developers.hyp.co.il/enterprise (Hello World, doDeal, refundDeal, inquireTransactions)
 *  - https://developers.hyp.co.il/enterprise/payment-page-integration (iframe, redirect params)
 *  - CG Gateway Redirect API PDF (responseMac, inquireTransactions queryName=mpiTransaction)
 *
 * Deposit flow: doDeal validation=TxnSetup / mpiValidation=AutoComm with our Payment.id as
 * `uniqueid` returns `mpiHostedPageUrl` (shown in an iframe) and `token` (= the page's `txId`,
 * stored as Payment.providerTxId). The page redirects to success/error with txId, uniqueID,
 * cardToken, cardExp, personalId, cardMask and responseMac. verifyReturn checks the MAC and then
 * asks the gateway itself (inquireTransactions, mpiTransaction) for the outcome and amount.
 *
 * Saved cards: the card token (`cardToken` / `cardId`) is stored together with its expiry as an
 * opaque reference "<cardId>.<MMYY>" (see encodeCardRef), so later charges and payouts can send
 * both without a schema change.
 */

export interface HypOptions {
  /** Full relay endpoint, e.g. https://cguat2.creditguard.co.il/xpo/Relay */
  gatewayUrl: string;
  terminalNumber: string;
  user: string;
  password: string;
  mid: string;
  /** Used when the caller gives no return URL. */
  successUrl: string;
  errorUrl: string;
  cancelUrl: string;
  /** Origins allowed to frame the hosted page (ppsJSONConfig.frameAncestorURLs). */
  frameAncestors: readonly string[];
  language: 'HEB' | 'ENG';
  timeoutMs: number;
}

/** Gateway result codes: "000" is success. */
const OK = '000';

/** mpiTransaction statusCode (CG Redirect API, callback report). */
const MPI_SUCCEEDED = '0';
const MPI_FAILED = '4';

/** The gateway was reached but answered with an error, or did not answer usably. Never includes credentials. */
export class HypGatewayError extends Error {
  constructor(
    readonly reason: string,
    readonly resultCode?: string,
  ) {
    super(`HYP_GATEWAY_ERROR: ${reason}${resultCode ? ` (result ${resultCode})` : ''}`);
    this.name = 'HypGatewayError';
  }
}

/** Shekels (2 decimals at most) to agorot, the gateway's `total`. */
export function toAgorot(amount: number): number {
  const agorot = Math.round(amount * 100);
  if (!Number.isFinite(agorot) || agorot <= 0) throw new AppError(422, 'INVALID_AMOUNT');
  return agorot;
}

/** Token + expiry in one opaque string, stored as SavedCard.token / Payment.cardToken. */
export function encodeCardRef(cardId: string, cardExp?: string): string {
  return cardExp ? `${cardId}.${cardExp}` : cardId;
}

export function decodeCardRef(ref: string): { cardId: string; cardExp?: string } {
  const m = /^([A-Za-z0-9-]+)(?:\.(\d{4}))?$/.exec(ref);
  if (!m) throw new AppError(422, 'INVALID_CARD_TOKEN');
  return { cardId: m[1]!, cardExp: m[2] };
}

/**
 * Our idempotency key as the gateway's `user` field (1-19 alphanumerics), so a repeated charge
 * or payout can be found with inquireTransactions before sending it again.
 */
export function idempotencyRef(idempotencyKey: string): string {
  return `lm${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 17)}`;
}

/**
 * responseMac per the Hello World guide and CG Redirect API §9.3: SHA-256 over
 * password + txId + errorCode ("000" when empty) + cardToken + cardExp + personalId + uniqueId.
 * TODO(hyp-sandbox): the guide says hex, the PDF says base64; both encodings are accepted.
 */
export function computeResponseMac(password: string, p: Readonly<Record<string, string>>, uniqueId: string): Buffer {
  const input =
    password +
    (p.txId ?? '') +
    (p.errorCode || OK) +
    (p.cardToken ?? '') +
    (p.cardExp ?? '') +
    (p.personalId ?? '') +
    uniqueId;
  return createHash('sha256').update(input, 'utf8').digest();
}

function macMatches(expected: Buffer, given: string): boolean {
  const candidates = [/^[0-9a-f]{64}$/i.test(given) ? Buffer.from(given, 'hex') : null, Buffer.from(given, 'base64')];
  return candidates.some((c) => c !== null && c.length === expected.length && timingSafeEqual(c, expected));
}

/** Query parameter by any of its spellings (the docs disagree on uniqueID / uniqueId, responseMac / responseMAC). */
function param(p: Readonly<Record<string, string>>, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = p[n];
    if (typeof v === 'string' && v !== '') return v;
  }
  return undefined;
}

const TX_ID = /^[A-Za-z0-9-]{1,64}$/;
const UNIQUE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export class HypPaymentProvider implements PaymentProvider {
  readonly name = 'hyp';
  readonly embeddable = true;

  constructor(private readonly opts: HypOptions) {}

  // ---------------------------------------------------------------- transport

  /**
   * One relay call. Returns the response XML when `result` is 000 (or allowed); throws
   * HypGatewayError otherwise, and for a timeout, a network failure or an unreadable answer.
   */
  private async call(
    command: string,
    body: XmlFields,
    opts: { allowResults?: string[]; anyResult?: boolean } = {},
  ): Promise<{ xml: string; result: string }> {
    const intIn = ashraitRequest(command, body, this.opts.language);
    let res;
    try {
      res = await fetchBounded(
        this.opts.gatewayUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
          body: new URLSearchParams({ user: this.opts.user, password: this.opts.password, int_in: intIn }).toString(),
        },
        this.opts.timeoutMs,
        256 * 1024,
      );
    } catch (err) {
      if (err instanceof HttpRequestFailure) throw new HypGatewayError(`${command}: ${err.reason}`);
      throw err;
    }
    if (!res.ok) throw new HypGatewayError(`${command}: HTTP ${res.status}`);
    const result = xmlField(res.text, 'result');
    if (result === undefined) throw new HypGatewayError(`${command}: unexpected response (no result)`);
    if (result !== OK && !opts.anyResult && !opts.allowResults?.includes(result)) {
      throw new HypGatewayError(`${command}: ${xmlField(res.text, 'message') ?? 'error'}`, result);
    }
    return { xml: res.text, result };
  }

  // ---------------------------------------------------------------- hosted page

  async createCheckout(
    _userId: string,
    amount: number,
    returnUrls: CheckoutReturnUrls = {},
    options: CheckoutOptions = {},
  ): Promise<CheckoutSession> {
    const uniqueId = options.reference;
    if (!uniqueId || !UNIQUE_ID.test(uniqueId)) throw new Error('hyp: createCheckout needs a reference (Payment.id)');

    const ppsJSONConfig = JSON.stringify({
      frameAncestorURLs: this.opts.frameAncestors.join(' '),
      // TODO(hyp-sandbox): confirm the parent window (not the iframe) is sent to success/error.
      // The web return page also breaks out of a frame itself, so either way works.
      uiCustomData: { redirectTargetParent: true },
    });

    let xml: string;
    try {
      ({ xml } = await this.call('doDeal', {
        terminalNumber: this.opts.terminalNumber,
        cardNo: 'CGMPI',
        total: toAgorot(amount),
        transactionType: 'Debit',
        creditType: 'RegularCredit',
        currency: 'ILS',
        transactionCode: 'Internet',
        validation: 'TxnSetup',
        mid: this.opts.mid,
        uniqueid: uniqueId,
        // One-phase sale. The card token comes back on the redirect (cardToken) when the
        // terminal has tokenization (Card ID) enabled. TODO(hyp-sandbox): confirm it is enabled.
        mpiValidation: 'AutoComm',
        successUrl: returnUrls.successUrl ?? this.opts.successUrl,
        // The error landing is the success page too: it verifies and shows the failure.
        errorUrl: returnUrls.successUrl ?? this.opts.errorUrl,
        cancelUrl: returnUrls.cancelUrl ?? this.opts.cancelUrl,
        // TODO(hyp-sandbox): confirm the page asks for the Israeli ID (useId) per terminal setup.
        paymentPageData: { ppsJSONConfig },
      }));
    } catch (err) {
      if (err instanceof HypGatewayError) {
        console.error(`[payments] ${err.message}`);
        throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment page could not be opened');
      }
      throw err;
    }

    const status = xmlField(xml, 'status');
    const checkoutUrl = xmlField(xml, 'mpiHostedPageUrl');
    const txId = xmlField(xml, 'token') || (checkoutUrl ? new URL(checkoutUrl).searchParams.get('txId') : null);
    if ((status && status !== OK) || !checkoutUrl || !txId || !checkoutUrl.startsWith('https://')) {
      console.error(`[payments] hyp doDeal setup: unusable response (status ${status ?? 'none'})`);
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment page could not be opened');
    }
    return { checkoutUrl, paymentId: txId };
  }

  /**
   * Success / error redirect. The MAC proves the parameters came from Hyp; the inquiry is the
   * authoritative answer (status and amount are taken from it, never from the query string).
   */
  async verifyReturn(params: Readonly<Record<string, string>>): Promise<WebhookEvent> {
    const txId = param(params, 'txId');
    const uniqueId = param(params, 'uniqueID', 'uniqueId', 'uniqueid');
    const mac = param(params, 'responseMac', 'responseMAC');
    if (!txId || !TX_ID.test(txId) || !uniqueId || !UNIQUE_ID.test(uniqueId)) {
      throw new AppError(400, 'INVALID_PAYMENT_RETURN');
    }
    if (!mac || !macMatches(computeResponseMac(this.opts.password, params, uniqueId), mac)) {
      throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE');
    }
    return this.inquire(txId, uniqueId);
  }

  /**
   * TODO(hyp-sandbox): Hyp's webhook payload format is not in the public docs we could read.
   * Assumed: the same fields as the redirect (form-encoded or JSON), MAC included.
   */
  async verifyWebhook(rawBody: Buffer, _headers: IncomingHttpHeaders): Promise<WebhookEvent> {
    const text = rawBody.toString('utf8');
    let params: Record<string, string> = {};
    try {
      const json: unknown = JSON.parse(text);
      if (json && typeof json === 'object') {
        for (const [k, v] of Object.entries(json)) if (typeof v === 'string' || typeof v === 'number') params[k] = String(v);
      }
    } catch {
      params = Object.fromEntries(new URLSearchParams(text));
    }
    return this.verifyReturn(params);
  }

  /** inquireTransactions / mpiTransaction for one hosted-page transaction. */
  private async inquireMpi(txId: string): Promise<string | null> {
    let xml: string;
    try {
      ({ xml } = await this.call('inquireTransactions', {
        terminalNumber: this.opts.terminalNumber,
        mainTerminalNumber: '',
        queryName: 'mpiTransaction',
        mid: this.opts.mid,
        mpiTransactionId: txId,
      }));
    } catch (err) {
      if (err instanceof HypGatewayError) {
        console.error(`[payments] ${err.message}`);
        throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Could not confirm the payment with the provider');
      }
      throw err;
    }
    return xmlBlocks(xml, 'row')[0] ?? null;
  }

  private async inquire(txId: string, uniqueId: string): Promise<WebhookEvent> {
    const row = await this.inquireMpi(txId);
    // The gateway reports nothing until the buyer has finished on the page
    if (!row) return { providerTxId: txId, status: 'pending', amount: 0, reference: uniqueId };

    const rowUniqueId = xmlField(row, 'uniqueid') ?? xmlField(row, 'uniqueID');
    const rowTxId = xmlField(row, 'mpiTransactionId');
    if ((rowUniqueId && rowUniqueId !== uniqueId) || (rowTxId && rowTxId !== txId)) {
      throw new AppError(400, 'PAYMENT_REFERENCE_MISMATCH');
    }

    const statusCode = xmlField(row, 'statusCode');
    const gatewayCode = xmlField(row, 'cgGatewayResponseCode');
    let status: ProviderPaymentStatus = 'pending';
    if (statusCode === MPI_SUCCEEDED && (!gatewayCode || gatewayCode === OK)) status = 'approved';
    else if (statusCode === MPI_FAILED || (statusCode === MPI_SUCCEEDED && gatewayCode && gatewayCode !== OK)) {
      status = 'failed';
    }

    const agorot = Number(xmlField(row, 'amount') ?? xmlField(row, 'total'));
    const event: WebhookEvent = {
      providerTxId: txId,
      status,
      amount: Number.isFinite(agorot) ? agorot / 100 : 0,
      reference: uniqueId,
    };
    if (status === 'approved') {
      const cardId = xmlField(row, 'cardId') || undefined;
      const cardExp = xmlField(row, 'cardExpiration') || xmlField(row, 'expirationDate') || undefined;
      const mask = xmlField(row, 'cardMask') || cardId;
      const last4 = mask ? /(\d{4})$/.exec(mask)?.[1] : undefined;
      if (cardId) event.cardToken = encodeCardRef(cardId, cardExp);
      if (last4) event.cardLast4 = last4;
    }
    return event;
  }

  // ---------------------------------------------------------------- refunds

  /**
   * refundDeal for a hosted-page payment. The page's txId is not the gateway's tranId, so the
   * mpiTransaction inquiry is read first and tranId taken from its cgGatewayResponseXML.
   */
  async refund(providerTxId: string, amount: number): Promise<void> {
    const row = await this.inquireMpi(providerTxId);
    const gatewayXml = row ? decodeXmlText(xmlField(row, 'cgGatewayResponseXML') ?? '') : '';
    const tranId = xmlField(gatewayXml, 'tranId');
    if (!tranId) throw new HypGatewayError('refundDeal: original tranId not found');
    const { xml } = await this.call('refundDeal', {
      terminalNumber: this.opts.terminalNumber,
      tranId,
      total: toAgorot(amount),
    });
    const status = xmlField(xml, 'status');
    if (status && status !== OK) throw new HypGatewayError('refundDeal declined', status);
  }

  // ---------------------------------------------------------------- saved card

  async chargeCard(cardToken: string, amount: number, idempotencyKey: string): Promise<CardChargeResult> {
    const r = await this.tokenDeal('Debit', cardToken, amount, idempotencyKey);
    return { providerTxId: r.tranId, status: r.ok ? 'approved' : 'failed' };
  }

  /** Payout to the card (doDeal transactionType=Credit, "payout charge"). */
  async creditCard(cardToken: string, amount: number, idempotencyKey: string): Promise<CardCreditResult> {
    const r = await this.tokenDeal('Credit', cardToken, amount, idempotencyKey);
    return { providerTxId: r.tranId, status: r.ok ? 'paid' : 'failed' };
  }

  /**
   * A doDeal on a saved token, idempotent on `idempotencyKey`: the key goes out as `user`, and a
   * successful transaction already carrying it is returned instead of sending a second one.
   * A definite gateway answer other than 000 is a decline (`ok: false`); a transport failure or
   * an unreadable answer throws (outcome unknown, the caller retries with the same key).
   */
  private async tokenDeal(
    transactionType: 'Debit' | 'Credit',
    cardToken: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<{ ok: boolean; tranId: string }> {
    const { cardId, cardExp } = decodeCardRef(cardToken);
    const user = idempotencyRef(idempotencyKey);

    const previous = await this.findByUser(user);
    if (previous) return { ok: true, tranId: previous };

    // A declined deal is a definite answer with a non-000 result, not a transport failure
    const { xml, result } = await this.call(
      'doDeal',
      {
        terminalNumber: this.opts.terminalNumber,
        cardId,
        // TODO(hyp-sandbox): confirm cardExpiration is required with cardId on this terminal.
        cardExpiration: cardExp,
        total: toAgorot(amount),
        transactionType,
        creditType: 'RegularCredit',
        currency: 'ILS',
        transactionCode: 'Internet',
        validation: 'AutoComm',
        user,
      },
      { anyResult: true },
    );
    const status = xmlField(xml, 'status') ?? result;
    const tranId = xmlField(xml, 'tranId') || `hyp_${user}`;
    if (result === OK && status === OK) return { ok: true, tranId };
    console.error(`[payments] hyp ${transactionType} on saved card declined (result ${result}, status ${status})`);
    return { ok: false, tranId };
  }

  /**
   * tranId of a successful transaction sent earlier with `user`, if any. Callers' keys are
   * distinct per operation (`withdrawal:<id>`, `deposit:<id>`), so the type is not compared.
   * TODO(hyp-sandbox): confirm inquireTransactions finds transactions by `user` right after the deal.
   */
  private async findByUser(user: string): Promise<string | null> {
    // "099 no transactions found" is an answer, not an error
    const { xml, result } = await this.call(
      'inquireTransactions',
      { terminalNumber: this.opts.terminalNumber, user },
      { allowResults: ['099'] },
    );
    if (result !== OK) return null;
    for (const tx of xmlBlocks(xml, 'transaction')) {
      const status = xmlField(tx, 'status');
      const financial = xmlField(tx, 'financialStatus');
      if (status !== OK || financial === 'REJECTED' || financial === 'CANCELLED') continue;
      const tranId = xmlField(tx, 'tranId');
      if (tranId) return tranId;
    }
    return null;
  }
}
