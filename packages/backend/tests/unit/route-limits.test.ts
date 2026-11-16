import { describe, it, expect } from 'vitest';
import { matchRule, consumeRule, type CounterStore } from '../../src/lib/route-limits.js';
import { isAllowedOrigin } from '../../src/plugins/cors.js';

function memoryCounter(): CounterStore & { keys: () => string[] } {
  const counts = new Map<string, number>();
  return {
    async hit(key, windowMs) {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return { count: n, resetMs: windowMs };
    },
    keys: () => [...counts.keys()],
  };
}

describe('matchRule', () => {
  it('covers OTP, login, checkout, withdrawals, orders, KYC and admin routes', () => {
    expect(matchRule('POST', '/auth/send-otp')?.name).toBe('otp-send');
    expect(matchRule('POST', '/auth/verify-otp')?.name).toBe('otp-verify');
    expect(matchRule('POST', '/auth/refresh')?.name).toBe('token-refresh');
    expect(matchRule('POST', '/payments/checkout')?.name).toBe('checkout');
    expect(matchRule('POST', '/wallet/withdrawals')?.name).toBe('withdrawals');
    expect(matchRule('POST', '/wallet/withdrawals/:id/cancel')?.name).toBe('withdrawals');
    expect(matchRule('POST', '/orders')?.name).toBe('orders');
    expect(matchRule('POST', '/me/kyc')?.name).toBe('kyc');
    expect(matchRule('POST', '/admin/withdrawals/:id/approve')?.name).toBe('admin-write');
    expect(matchRule('GET', '/admin/users')?.name).toBe('admin-read');
  });

  it('leaves other routes to the global limit', () => {
    expect(matchRule('GET', '/wallet/withdrawals')).toBeUndefined();
    expect(matchRule('GET', '/orders')).toBeUndefined();
    expect(matchRule('POST', '/payments/webhook')).toBeUndefined();
    expect(matchRule('GET', undefined)).toBeUndefined();
  });
});

describe('consumeRule', () => {
  it('limits per user and per IP independently', async () => {
    const store = memoryCounter();
    const rule = matchRule('POST', '/payments/checkout')!; // user 10 / IP 30 per 10 min
    for (let i = 0; i < 10; i++) {
      expect((await consumeRule(store, rule, { ip: '1.1.1.1', userId: 'user:u1' })).limited).toBe(false);
    }
    expect(await consumeRule(store, rule, { ip: '1.1.1.1', userId: 'user:u1' })).toMatchObject({ limited: true, bucket: 'user' });
    // Another user behind the same IP is not affected by u1's bucket
    expect((await consumeRule(store, rule, { ip: '1.1.1.1', userId: 'user:u2' })).limited).toBe(false);
  });

  it('per-IP bucket catches many users (or no user) from one IP', async () => {
    const store = memoryCounter();
    const rule = matchRule('POST', '/auth/send-otp')!; // IP 10 / 15 min
    for (let i = 0; i < 10; i++) expect((await consumeRule(store, rule, { ip: '2.2.2.2' })).limited).toBe(false);
    const d = await consumeRule(store, rule, { ip: '2.2.2.2' });
    expect(d).toMatchObject({ limited: true, bucket: 'ip' });
    expect(d.limited && d.retryAfterSec).toBe(900);
  });

  it('keys phone buckets by a hash, never the number', async () => {
    const store = memoryCounter();
    const rule = matchRule('POST', '/auth/verify-otp')!;
    await consumeRule(store, rule, { ip: '3.3.3.3', phone: '+972501234567' });
    expect(store.keys().join()).not.toContain('972501234567');
    expect(store.keys().some((k) => k.includes(':phone:'))).toBe(true);
  });
});

describe('CORS', () => {
  it('allows listed origins and requests without Origin, refuses others', () => {
    const allowed = ['https://lotto.example'];
    expect(isAllowedOrigin('https://lotto.example', allowed)).toBe(true);
    expect(isAllowedOrigin(undefined, allowed)).toBe(true);
    expect(isAllowedOrigin('https://evil.example', allowed)).toBe(false);
    expect(isAllowedOrigin('https://lotto.example.evil.example', allowed)).toBe(false);
  });
});
