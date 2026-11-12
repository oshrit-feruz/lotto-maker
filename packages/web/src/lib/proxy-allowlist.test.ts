import { describe, expect, it } from 'vitest';
import { isProxyAllowed } from './proxy-allowlist';

describe('isProxyAllowed', () => {
  it('allows customer routes', () => {
    expect(isProxyAllowed('GET', 'me')).toBe(true);
    expect(isProxyAllowed('POST', 'me/kyc')).toBe(true);
    expect(isProxyAllowed('POST', 'tickets/calculate')).toBe(true);
    expect(isProxyAllowed('POST', 'orders')).toBe(true);
    expect(isProxyAllowed('GET', 'orders/ck123/scan')).toBe(true);
    expect(isProxyAllowed('GET', 'payments/ck123')).toBe(true);
    expect(isProxyAllowed('POST', 'wallet/withdrawals/w1/cancel')).toBe(true);
    expect(isProxyAllowed('DELETE', 'me/cards/c1')).toBe(true);
    expect(isProxyAllowed('GET', 'wallet/withdrawals/quote')).toBe(true);
  });
  it('allows the public integration-pass routes, GET only', () => {
    expect(isProxyAllowed('GET', 'draws/next')).toBe(true);
    expect(isProxyAllowed('GET', 'draws/upcoming')).toBe(true);
    expect(isProxyAllowed('GET', 'results/latest')).toBe(true);
    expect(isProxyAllowed('GET', 'results/lotto/latest')).toBe(true);
    expect(isProxyAllowed('GET', 'prices')).toBe(true);
    expect(isProxyAllowed('POST', 'draws/next')).toBe(false);
    expect(isProxyAllowed('POST', 'prices')).toBe(false);
    expect(isProxyAllowed('DELETE', 'results/latest')).toBe(false);
    expect(isProxyAllowed('POST', 'wallet/withdrawals/quote')).toBe(false);
    expect(isProxyAllowed('GET', 'wallet/withdrawals/quote/extra')).toBe(false);
  });
  it('keeps neighbouring routes blocked', () => {
    expect(isProxyAllowed('GET', 'results/3990')).toBe(false);
    expect(isProxyAllowed('GET', 'results/chance/latest')).toBe(false);
    expect(isProxyAllowed('GET', 'draws/next/1')).toBe(false);
    expect(isProxyAllowed('GET', 'prices/regular')).toBe(false);
    expect(isProxyAllowed('GET', 'admin/prices')).toBe(false);
    expect(isProxyAllowed('POST', 'auth/logout')).toBe(false);
    expect(isProxyAllowed('DELETE', 'auth/logout')).toBe(false);
    expect(isProxyAllowed('GET', 'admin/draws')).toBe(false);
    expect(isProxyAllowed('GET', 'admin/users')).toBe(false);
  });
  it('blocks admin, operator, webhook and dev routes', () => {
    expect(isProxyAllowed('GET', 'admin/withdrawals')).toBe(false);
    expect(isProxyAllowed('POST', 'operators/login')).toBe(false);
    expect(isProxyAllowed('POST', 'payments/webhook')).toBe(false);
    expect(isProxyAllowed('GET', 'payments/webhook')).toBe(false);
    expect(isProxyAllowed('GET', 'payments/mock-checkout')).toBe(false);
    expect(isProxyAllowed('POST', 'auth/refresh')).toBe(false);
    expect(isProxyAllowed('POST', 'me/device-token')).toBe(false);
  });
  it('blocks wrong methods and odd paths', () => {
    expect(isProxyAllowed('DELETE', 'orders/abc')).toBe(false);
    expect(isProxyAllowed('GET', 'orders/../admin')).toBe(false);
    expect(isProxyAllowed('GET', 'orders//scan')).toBe(false);
    expect(isProxyAllowed('PATCH', 'me')).toBe(false);
  });
});
