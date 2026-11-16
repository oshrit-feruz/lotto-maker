import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// The production-hardening layer of the real app (Phase 7): health, request ids, CORS, headers,
// body limit and the route rate limits, against a real Redis. Needs no database, except /ready.

vi.mock('twilio', () => ({
  default: vi.fn(() => ({ messages: { create: vi.fn().mockResolvedValue({ sid: 'SM_mock' }) } })),
}));
vi.mock('firebase-admin', () => ({
  default: { initializeApp: vi.fn(), messaging: vi.fn(() => ({ send: vi.fn() })) },
}));

describe('API hardening (e2e)', () => {
  let app: FastifyInstance;
  // A private IP per run, so these limits do not collide with the other suites (which use 127.0.0.1)
  const remoteAddress = `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/server.js');
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    const { redis } = await import('../../src/redis.js');
    await redis.quit();
  });

  it('/health is up and every response carries a request id', async () => {
    const res = await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'e2e-req-1' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBe('e2e-req-1');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('/ready reports database and redis', async (ctx) => {
    if (process.env.E2E_DATABASE !== '1') return ctx.skip();
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json().checks.database.ok).toBe(true);
    expect(res.json().checks.redis.ok).toBe(true);
  });

  it('CORS answers listed origins only', async () => {
    const ok = await app.inject({
      method: 'OPTIONS',
      url: '/orders',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' },
    });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const evil = await app.inject({
      method: 'OPTIONS',
      url: '/orders',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses an oversized JSON body with 413', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/send-otp',
      remoteAddress,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ phone: 'x'.repeat(300 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
  });

  it('rate-limits OTP verification per IP across phones, backed by Redis', async () => {
    // Each call uses a fresh phone, so the OTP module's own per-phone lock never triggers;
    // only the route rule (20 per IP per 15 min) can answer 429
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const phone = `+9725${String(Date.now() % 1e7).padStart(7, '0')}${String(i).padStart(2, '0')}`;
      const res = await app.inject({ method: 'POST', url: '/auth/verify-otp', remoteAddress, payload: { phone, code: '000000' } });
      statuses.push(res.statusCode);
      if (i === 20) {
        expect(res.json()).toMatchObject({ error: 'RATE_LIMITED', message: 'Too many requests' });
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      }
    }
    expect(statuses.slice(0, 20).every((s) => s !== 429)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
