import { describe, expect, it } from 'vitest';
import { hostedResultParams, isEmbeddablePaymentUrl, returnedPaymentId } from './hosted-payment';

describe('isEmbeddablePaymentUrl', () => {
  it('allows only https pages of the gateway', () => {
    expect(isEmbeddablePaymentUrl('https://ppsuat.creditguard.co.il/?txId=abc')).toBe(true);
    expect(isEmbeddablePaymentUrl('https://pps.creditguard.co.il/?txId=abc')).toBe(true);
    expect(isEmbeddablePaymentUrl('http://pps.creditguard.co.il/?txId=abc')).toBe(false);
    expect(isEmbeddablePaymentUrl('https://creditguard.co.il.evil.example/')).toBe(false);
    expect(isEmbeddablePaymentUrl('https://evilcreditguard.co.il/')).toBe(false);
    expect(isEmbeddablePaymentUrl('javascript:alert(1)')).toBe(false);
    expect(isEmbeddablePaymentUrl('not a url')).toBe(false);
  });
});

describe('hostedResultParams', () => {
  it('keeps the known result parameters only', () => {
    const p = new URLSearchParams('paymentId=pay1&txId=tx1&uniqueID=pay1&responseMac=ab&cardToken=4580&evil=x');
    expect(hostedResultParams(p)).toEqual({ txId: 'tx1', uniqueID: 'pay1', responseMac: 'ab', cardToken: '4580' });
  });
  it('is null without a txId (mock provider)', () => {
    expect(hostedResultParams(new URLSearchParams('paymentId=pay1'))).toBeNull();
  });
});

describe('returnedPaymentId', () => {
  it('prefers paymentId, falls back to uniqueID', () => {
    expect(returnedPaymentId(new URLSearchParams('paymentId=pay1&uniqueID=pay2'))).toBe('pay1');
    expect(returnedPaymentId(new URLSearchParams('uniqueID=pay2'))).toBe('pay2');
    expect(returnedPaymentId(new URLSearchParams('paymentId=../x'))).toBeNull();
    expect(returnedPaymentId(new URLSearchParams(''))).toBeNull();
  });
});
