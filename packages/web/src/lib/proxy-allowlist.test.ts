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
