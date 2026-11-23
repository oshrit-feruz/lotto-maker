import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeCardRef,
  encodeCardRef,
  HypGatewayError,
  HypPaymentProvider,
  idempotencyRef,
  toAgorot,
} from '../../src/modules/payments/hyp/hyp-payment-provider.js';
import { decodeXmlText, xmlBlocks, xmlElements, xmlField } from '../../src/modules/payments/hyp/hyp-xml.js';
import {
  dealOk,
  fakeHypGateway,
  field,
  HYP_NOT_FOUND as NOT_FOUND,
  HYP_OPTS,
  mpiRow,
  returnParams,
  setupResponse,
} from './helpers/fake-hyp.js';

const hyp = () => new HypPaymentProvider(HYP_OPTS);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hyp xml helpers', () => {
  it('escapes values and nests objects', () => {
    expect(xmlElements({ a: 'x<&>"', b: 5, skip: undefined, c: { d: '1' } })).toBe(
      '<a>x&lt;&amp;&gt;&quot;</a><b>5</b><c><d>1</d></c>',
    );
  });

  it('reads leaf fields with attributes, empty elements and entities', () => {
    const xml = '<r><transactionType code="01">Debit</transactionType><e/><m>a &amp; b</m></r>';
    expect(xmlField(xml, 'transactionType')).toBe('Debit');
    expect(xmlField(xml, 'e')).toBe('');
    expect(xmlField(xml, 'm')).toBe('a & b');
    expect(xmlField(xml, 'missing')).toBeUndefined();
    expect(xmlBlocks('<x><row>1</row><row>2</row></x>', 'row')).toEqual(['1', '2']);
    expect(decodeXmlText('<![CDATA[<a>]]>')).toBe('<a>');
  });
});

describe('hyp helpers', () => {
  it('converts shekels to agorot', () => {
    expect(toAgorot(47.3)).toBe(4730);
    expect(toAgorot(0.1 + 0.2)).toBe(30);
    expect(() => toAgorot(0)).toThrow();
  });

  it('round-trips the saved card reference', () => {
    expect(decodeCardRef(encodeCardRef('4580000000004242', '1228'))).toEqual({ cardId: '4580000000004242', cardExp: '1228' });
    expect(decodeCardRef('4580000000004242')).toEqual({ cardId: '4580000000004242', cardExp: undefined });
    expect(() => decodeCardRef('bad token!')).toThrow();
  });

  it('maps an idempotency key to a stable 19-character user reference', () => {
    const ref = idempotencyRef('withdrawal:abc');
    expect(ref).toMatch(/^[a-z0-9]{19}$/);
    expect(idempotencyRef('withdrawal:abc')).toBe(ref);
    expect(idempotencyRef('withdrawal:abd')).not.toBe(ref);
  });
});

describe('hyp createCheckout', () => {
  it('sends a TxnSetup doDeal and returns the hosted page and txId', async () => {
    const gw = fakeHypGateway({ doDeal: () => setupResponse('tx-111') });
    const session = await hyp().createCheckout(
      'user-1',
      47.3,
      { successUrl: 'https://lotto.example/payment/success?paymentId=pay1', cancelUrl: 'https://lotto.example/payment/canceled?paymentId=pay1' },
      { reference: 'pay1' },
    );
    expect(session).toEqual({ checkoutUrl: 'https://ppsuat.creditguard.co.il/?txId=tx-111', paymentId: 'tx-111' });

    const [call] = gw.calls;
    expect(gw.fetchMock.mock.calls[0]![0]).toBe(HYP_OPTS.gatewayUrl);
    expect(call!.user).toBe('api-user');
    expect(call!.password).toBe('api-pass');
    const x = call!.xml;
    expect(field(x, 'terminalNumber')).toBe('0962832');
    expect(field(x, 'cardNo')).toBe('CGMPI');
    expect(field(x, 'total')).toBe('4730');
    expect(field(x, 'transactionType')).toBe('Debit');
    expect(field(x, 'currency')).toBe('ILS');
    expect(field(x, 'validation')).toBe('TxnSetup');
    expect(field(x, 'mpiValidation')).toBe('AutoComm');
    expect(field(x, 'mid')).toBe('12345');
    expect(field(x, 'uniqueid')).toBe('pay1');
    expect(field(x, 'successUrl')).toBe('https://lotto.example/payment/success?paymentId=pay1');
    expect(field(x, 'errorUrl')).toBe('https://lotto.example/payment/success?paymentId=pay1');
    expect(field(x, 'cancelUrl')).toBe('https://lotto.example/payment/canceled?paymentId=pay1');
    const pps = JSON.parse(decodeXmlText(field(x, 'ppsJSONConfig')!));
    expect(pps.frameAncestorURLs).toBe('https://lotto.example');
  });

  it('falls back to the configured return pages', async () => {
    const gw = fakeHypGateway({ doDeal: () => setupResponse('tx-1') });
    await hyp().createCheckout('user-1', 10, undefined, { reference: 'pay2' });
    expect(field(gw.calls[0]!.xml, 'successUrl')).toBe(HYP_OPTS.successUrl);
    expect(field(gw.calls[0]!.xml, 'cancelUrl')).toBe(HYP_OPTS.cancelUrl);
  });

  it('turns a gateway error into 502 without leaking the message', async () => {
    fakeHypGateway({ doDeal: () => setupResponse('tx-1', '405') });
    await expect(hyp().createCheckout('user-1', 10, undefined, { reference: 'pay3' })).rejects.toMatchObject({
      statusCode: 502,
      code: 'PAYMENT_PROVIDER_ERROR',
    });
  });

  it('turns a timeout into 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_u: unknown, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))),
    );
    const p = new HypPaymentProvider({ ...HYP_OPTS, timeoutMs: 20 });
    await expect(p.createCheckout('user-1', 10, undefined, { reference: 'pay4' })).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe('hyp verifyReturn', () => {
  it('checks the MAC, then takes status and amount from the inquiry', async () => {
    const gw = fakeHypGateway({ inquireTransactions: () => mpiRow({ txId: 'tx-1', uniqueId: 'pay1', agorot: 4730 }) });
    const event = await hyp().verifyReturn(returnParams('tx-1', 'pay1', { authNumber: 'forged' }));
    expect(event).toEqual({
      providerTxId: 'tx-1',
      status: 'approved',
      amount: 47.3,
      reference: 'pay1',
      cardToken: '4580000000004242.1228',
      cardLast4: '4242',
    });
    const x = gw.calls[0]!.xml;
    expect(field(x, 'queryName')).toBe('mpiTransaction');
    expect(field(x, 'mpiTransactionId')).toBe('tx-1');
  });

  it('accepts a base64-encoded MAC as well', async () => {
    fakeHypGateway({ inquireTransactions: () => mpiRow({ txId: 'tx-1', uniqueId: 'pay1', agorot: 100 }) });
    const p = returnParams('tx-1', 'pay1');
    p.responseMac = Buffer.from(p.responseMac!, 'hex').toString('base64');
    await expect(hyp().verifyReturn(p)).resolves.toMatchObject({ status: 'approved' });
  });

  it('rejects a wrong or missing MAC without calling the gateway', async () => {
    const gw = fakeHypGateway({});
    const forged = returnParams('tx-1', 'pay1', {}, 'not-the-password');
    await expect(hyp().verifyReturn(forged)).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_WEBHOOK_SIGNATURE' });
    const { responseMac: _m, ...noMac } = returnParams('tx-1', 'pay1');
    await expect(hyp().verifyReturn(noMac)).rejects.toMatchObject({ statusCode: 401 });
    // A valid MAC for other parameters: changing the txId breaks it
    await expect(hyp().verifyReturn({ ...returnParams('tx-1', 'pay1'), txId: 'tx-2' })).rejects.toMatchObject({ statusCode: 401 });
    expect(gw.calls).toHaveLength(0);
  });

  it('rejects an inquiry row for another payment', async () => {
    fakeHypGateway({ inquireTransactions: () => mpiRow({ txId: 'tx-1', uniqueId: 'pay-other', agorot: 100 }) });
    await expect(hyp().verifyReturn(returnParams('tx-1', 'pay1'))).rejects.toMatchObject({ code: 'PAYMENT_REFERENCE_MISMATCH' });
  });

  it('reports a failed payment (error URL) as failed, without card details', async () => {
    fakeHypGateway({
      inquireTransactions: () => mpiRow({ txId: 'tx-1', uniqueId: 'pay1', agorot: 100, statusCode: '4', gatewayCode: '033' }),
    });
    const event = await hyp().verifyReturn(returnParams('tx-1', 'pay1', { errorCode: '033' }));
    expect(event.status).toBe('failed');
    expect(event.cardToken).toBeUndefined();
  });

  it('reports pending while the gateway has no result yet', async () => {
    fakeHypGateway({ inquireTransactions: () => '<ashrait><response><result>000</result><inquireTransactions/></response></ashrait>' });
    await expect(hyp().verifyReturn(returnParams('tx-1', 'pay1'))).resolves.toMatchObject({ status: 'pending' });
  });

  it('verifies a form-encoded webhook the same way', async () => {
    fakeHypGateway({ inquireTransactions: () => mpiRow({ txId: 'tx-1', uniqueId: 'pay1', agorot: 100 }) });
    const body = Buffer.from(new URLSearchParams(returnParams('tx-1', 'pay1')).toString());
    await expect(hyp().verifyWebhook(body, {})).resolves.toMatchObject({ status: 'approved', amount: 1 });
    await expect(hyp().verifyWebhook(Buffer.from('txId=tx-1&uniqueID=pay1'), {})).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('hyp refund', () => {
  it('finds the gateway tranId through the inquiry and sends refundDeal', async () => {
    const gw = fakeHypGateway({
      inquireTransactions: () => mpiRow({ txId: 'tx-1', uniqueId: 'pay1', agorot: 5000, tranId: '9911' }),
      refundDeal: () => '<ashrait><response><result>000</result><refundDeal><status>000</status></refundDeal></response></ashrait>',
    });
    await hyp().refund('tx-1', 50);
    expect(gw.commands()).toEqual(['inquireTransactions', 'refundDeal']);
    const x = gw.calls[1]!.xml;
    expect(field(x, 'tranId')).toBe('9911');
    expect(field(x, 'total')).toBe('5000');
  });

  it('throws when the gateway refuses', async () => {
    fakeHypGateway({
      inquireTransactions: () => mpiRow({ txId: 'tx-1', uniqueId: 'pay1', agorot: 5000 }),
      refundDeal: () => '<ashrait><response><result>404</result></response></ashrait>',
    });
    await expect(hyp().refund('tx-1', 50)).rejects.toBeInstanceOf(HypGatewayError);
  });
});

describe('hyp saved card (charge and payout)', () => {
  it('charges the token with its expiry and our key as user', async () => {
    const gw = fakeHypGateway({ inquireTransactions: () => NOT_FOUND, doDeal: () => dealOk('5001') });
    const result = await hyp().chargeCard('4580000000004242.1228', 25, 'deposit:pay1');
    expect(result).toEqual({ providerTxId: '5001', status: 'approved' });
    expect(gw.commands()).toEqual(['inquireTransactions', 'doDeal']);
    const ref = idempotencyRef('deposit:pay1');
    expect(field(gw.calls[0]!.xml, 'user')).toBe(ref);
    const x = gw.calls[1]!.xml;
    expect(field(x, 'cardId')).toBe('4580000000004242');
    expect(field(x, 'cardExpiration')).toBe('1228');
    expect(field(x, 'total')).toBe('2500');
    expect(field(x, 'transactionType')).toBe('Debit');
    expect(field(x, 'validation')).toBe('AutoComm');
    expect(field(x, 'user')).toBe(ref);
    expect(x).not.toContain('CGMPI');
  });

  it('does not charge again when a transaction with the same key already succeeded', async () => {
    const gw = fakeHypGateway({
      inquireTransactions: () =>
        '<ashrait><response><result>000</result><inquireTransactions><transactions>' +
        '<transaction><tranId>4000</tranId><status>000</status><financialStatus>REJECTED</financialStatus></transaction>' +
        '<transaction><tranId>5001</tranId><status>000</status><financialStatus>AUTHORIZED</financialStatus></transaction>' +
        '</transactions></inquireTransactions></response></ashrait>',
    });
    await expect(hyp().chargeCard('4580000000004242.1228', 25, 'deposit:pay1')).resolves.toEqual({
      providerTxId: '5001',
      status: 'approved',
    });
    expect(gw.commands()).toEqual(['inquireTransactions']);
  });

  it('reports a decline as failed', async () => {
    fakeHypGateway({
      inquireTransactions: () => NOT_FOUND,
      doDeal: () => '<ashrait><response><result>033</result><message>Declined</message></response></ashrait>',
    });
    await expect(hyp().chargeCard('4580000000004242.1228', 25, 'deposit:pay1')).resolves.toMatchObject({ status: 'failed' });
  });

  it('throws when the outcome is unknown', async () => {
    fakeHypGateway({ inquireTransactions: () => NOT_FOUND, doDeal: () => '<html>bad gateway</html>' });
    await expect(hyp().chargeCard('4580000000004242.1228', 25, 'deposit:pay1')).rejects.toBeInstanceOf(HypGatewayError);
  });

  it('pays out to the card with transactionType Credit', async () => {
    const gw = fakeHypGateway({ inquireTransactions: () => NOT_FOUND, doDeal: () => dealOk('6001') });
    await expect(hyp().creditCard('4580000000004242.1228', 120.5, 'withdrawal:w1')).resolves.toEqual({
      providerTxId: '6001',
      status: 'paid',
    });
    expect(field(gw.calls[1]!.xml, 'transactionType')).toBe('Credit');
    expect(field(gw.calls[1]!.xml, 'total')).toBe('12050');
  });

  it('sends the password only as the form field, never inside the XML', async () => {
    const gw = fakeHypGateway({ inquireTransactions: () => NOT_FOUND, doDeal: () => dealOk('1') });
    await hyp().chargeCard('4580000000004242', 1, 'k-12345678');
    for (const c of gw.calls) expect(c.xml).not.toContain(HYP_OPTS.password);
  });
});
