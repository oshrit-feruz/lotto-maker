import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const mockOrderFindUnique = vi.hoisted(() => vi.fn());
vi.mock('../../src/prisma.js', () => ({
  prisma: { order: { findUnique: mockOrderFindUnique } },
}));

import errorHandler from '../../src/plugins/error-handler.js';
import authPlugin from '../../src/plugins/auth.js';
import ordersRoutes from '../../src/modules/orders/orders.routes.js';
import { r2Service } from '../../src/storage/r2.service.js';

const SCAN_KEY = 'scans/slot-1-1700000000000.jpg';
const ORDER = { id: 'order-1', userId: 'owner', ticketScanKey: SCAN_KEY, status: 'scanned', queueSlot: null };

describe('r2Service.getSignedUrl', () => {
  it('returns a signed URL for the key that expires after 300s by default', async () => {
    const url = new URL(await r2Service.getSignedUrl(SCAN_KEY));
    expect(url.pathname).toContain(SCAN_KEY);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('X-Amz-Date')).toBeTruthy();
  });

  it('honours a custom TTL', async () => {
    const url = new URL(await r2Service.getSignedUrl(SCAN_KEY, 60));
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
  });
});

describe('GET /orders/:id/scan', () => {
  let app: FastifyInstance;
  const tokenFor = (sub: string, type: 'user' | 'operator' = 'user') => app.jwt.sign({ sub, type });
  const getScan = (token?: string) =>
    app.inject({
      method: 'GET',
      url: '/orders/order-1/scan',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  beforeEach(async () => {
    mockOrderFindUnique.mockReset().mockResolvedValue(ORDER);
    app = Fastify();
    await app.register(errorHandler);
    await app.register(authPlugin);
    await app.register(ordersRoutes);
    await app.ready();
  });

  afterEach(() => app.close());

  it('gives the owner a signed URL with an expiry', async () => {
    const res = await getScan(tokenFor('owner'));
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');

    const body = res.json<{ url: string; expiresIn: number }>();
    expect(body.expiresIn).toBe(300);
    const url = new URL(body.url);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });

  it('returns 403 to a user who does not own the order', async () => {
    const res = await getScan(tokenFor('someone-else'));
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain('X-Amz');
    expect(res.body).not.toContain(SCAN_KEY);
  });

  it('rejects unauthenticated and operator callers', async () => {
    expect((await getScan()).statusCode).toBe(401);
    expect((await getScan(tokenFor('op-1', 'operator'))).statusCode).toBe(403);
  });

  it('returns 404 when the order has no scan yet', async () => {
    mockOrderFindUnique.mockResolvedValue({ ...ORDER, ticketScanKey: null });
    const res = await getScan(tokenFor('owner'));
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('SCAN_NOT_AVAILABLE');
  });
});

describe('GET /orders/:id', () => {
  it('never exposes the storage key, only hasScan', async () => {
    mockOrderFindUnique.mockReset().mockResolvedValue(ORDER);
    const app = Fastify();
    await app.register(errorHandler);
    await app.register(authPlugin);
    await app.register(ordersRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/orders/order-1',
      headers: { authorization: `Bearer ${app.jwt.sign({ sub: 'owner', type: 'user' })}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().hasScan).toBe(true);
    expect(res.body).not.toContain('ticketScan');
    expect(res.body).not.toContain(SCAN_KEY);
    await app.close();
  });
});
