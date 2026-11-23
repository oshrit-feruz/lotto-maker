import { createHash } from 'node:crypto';
import { vi } from 'vitest';
import type { HypOptions } from '../../../src/modules/payments/hyp/hyp-payment-provider.js';

export const HYP_OPTS: HypOptions = {
  gatewayUrl: 'https://cguat2.creditguard.co.il/xpo/Relay',
  terminalNumber: '0962832',
  user: 'api-user',
  password: 'api-pass',
  mid: '12345',
  successUrl: 'https://api.example/payments/return',
  errorUrl: 'https://api.example/payments/return',
  cancelUrl: 'https://api.example/payments/return/cancel',
  frameAncestors: ['https://lotto.example'],
  language: 'HEB',
  timeoutMs: 1000,
};

export interface HypCall {
  command: string;
  user: string;
  password: string;
  xml: string;
}

/** A stand-in for the relay: `handlers[command]` returns the response XML for each request. */
export function fakeHypGateway(handlers: Record<string, (xml: string) => string>) {
  const calls: HypCall[] = [];
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const form = new URLSearchParams(String(init?.body ?? ''));
    const xml = form.get('int_in') ?? '';
    const command = /<command>([^<]+)<\/command>/.exec(xml)?.[1] ?? '';
    calls.push({ command, user: form.get('user') ?? '', password: form.get('password') ?? '', xml });
    const handler = handlers[command];
    if (!handler) return new Response('not found', { status: 404 });
    return new Response(handler(xml), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock, commands: () => calls.map((c) => c.command) };
}

export const field = (xml: string, name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)?.[1];

export function setupResponse(txId: string, result = '000'): string {
  return (
    `<ashrait><response><command>doDeal</command><result>${result}</result><message>OK</message>` +
    `<doDeal><status>${result}</status><token>${txId}</token>` +
    `<mpiHostedPageUrl>https://ppsuat.creditguard.co.il/?txId=${txId}</mpiHostedPageUrl></doDeal></response></ashrait>`
  );
}

export function mpiRow(o: {
  txId: string;
  uniqueId: string;
  agorot: number;
  statusCode?: string;
  gatewayCode?: string;
  cardId?: string;
  cardExp?: string;
  tranId?: string;
}): string {
  const gw = `<ashrait><response><result>000</result><tranId>${o.tranId ?? '77001'}</tranId></response></ashrait>`;
  return (
    '<ashrait><response><command>inquireTransactions</command><result>000</result><inquireTransactions><row>' +
    `<mpiTransactionId>${o.txId}</mpiTransactionId><uniqueid>${o.uniqueId}</uniqueid><amount>${o.agorot}</amount>` +
    `<currency>ILS</currency><cardId>${o.cardId ?? '4580000000004242'}</cardId>` +
    `<cardExpiration>${o.cardExp ?? '1228'}</cardExpiration><statusCode>${o.statusCode ?? '0'}</statusCode>` +
    `<cgGatewayResponseCode>${o.gatewayCode ?? '000'}</cgGatewayResponseCode>` +
    // Escaped, as the gateway nests the original doDeal response
    `<cgGatewayResponseXML>${gw.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</cgGatewayResponseXML>` +
    '</row></inquireTransactions></response></ashrait>'
  );
}

/** Redirect parameters as Hyp puts them on the success URL, with a valid hex responseMac. */
export function returnParams(txId: string, uniqueId: string, extra: Record<string, string> = {}, password = HYP_OPTS.password) {
  const p: Record<string, string> = {
    txId,
    uniqueID: uniqueId,
    lang: 'HE',
    cardToken: '4580000000004242',
    cardExp: '1228',
    personalId: '000000018',
    cardMask: '458000******4242',
    authNumber: '0123456',
    ...extra,
  };
  const input = password + p.txId + (p.errorCode || '000') + p.cardToken + p.cardExp + p.personalId + uniqueId;
  p.responseMac = createHash('sha256').update(input).digest('hex');
  return p;
}

/** inquireTransactions by `user` when nothing matches. */
export const HYP_NOT_FOUND = '<ashrait><response><result>099</result><message>No transactions found</message></response></ashrait>';

/** A successful doDeal on a saved token. */
export const dealOk = (tranId: string) =>
  `<ashrait><response><result>000</result><tranId>${tranId}</tranId><doDeal><status>000</status></doDeal></response></ashrait>`;

/** inquireTransactions by `user` finding one successful deal. */
export const foundDeal = (tranId: string) =>
  '<ashrait><response><result>000</result><inquireTransactions><transactions><transaction>' +
  `<tranId>${tranId}</tranId><status>000</status></transaction></transactions></inquireTransactions></response></ashrait>`;
