import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Decimal } from 'decimal.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdateMany: vi.fn(),
  orderFindMany: vi.fn(),
  walletTxFindMany: vi.fn(),
  auditFindMany: vi.fn(),
  auditCount: vi.fn(),
  auditCreate: vi.fn(),
  adminFindMany: vi.fn(),
  drawFindMany: vi.fn(),
  drawCount: vi.fn(),
  drawFindUnique: vi.fn(),
  drawUpdateMany: vi.fn(),
  claimFindMany: vi.fn(),
  claimFindUnique: vi.fn(),
  claimUpdateMany: vi.fn(),
}));

vi.mock('../../src/prisma.js', () => {
  const prisma: any = {
    user: { findMany: db.userFindMany, findUnique: db.userFindUnique, updateMany: db.userUpdateMany },
    order: { findMany: db.orderFindMany },
    walletTransaction: { findMany: db.walletTxFindMany },
    auditLog: { findMany: db.auditFindMany, count: db.auditCount, create: db.auditCreate },
    admin: { findMany: db.adminFindMany },
    draw: { findMany: db.drawFindMany, count: db.drawCount, findUnique: db.drawFindUnique, updateMany: db.drawUpdateMany },
    prizeClaim: { findMany: db.claimFindMany, findUnique: db.claimFindUnique, updateMany: db.claimUpdateMany },
  };
  prisma.$transaction = (fn: (tx: any) => Promise<unknown>) => fn(prisma);
  return { prisma };
});

const settleDraw = vi.hoisted(() => vi.fn());
vi.mock('../../src/modules/results/settlement.service.js', () => ({ settleDraw }));
vi.mock('../../src/services/notifications.js', () => ({ notificationService: { sendToUser: vi.fn() }, PAYLOADS: {} }));

import errorHandler from '../../src/plugins/error-handler.js';
import authPlugin from '../../src/plugins/auth.js';
import adminRoutes from '../../src/modules/admin/admin.routes.js';
import adminUsersRoutes from '../../src/modules/admin/admin-users.routes.js';
import adminMoneyRoutes from '../../src/modules/admin/admin-money.routes.js';
import { auditBound, normalizePhoneQuery } from '../../src/modules/admin/admin-users.service.js';

let app: FastifyInstance;
let adminToken: string;
const ADMIN = 'admin-1';

const userRow = (fields: Record<string, unknown> = {}) => ({
  id: 'user-1',
  phone: '+972501234567',
  fullName: 'Dana Levi',
  walletBalance: new Decimal('120.5'),
  status: 'active',
  verifiedAdult: true,
  idLast4: '2782',
  createdAt: new Date('2026-10-01T10:00:00Z'),
  // Never selected by the service; here to prove the response does not pass them through
  idNumberEnc: 'v1:secret',
  idNumberHash: 'abc',
  idNumberLegacy: '123456782',
  ...fields,
});

const get = (url: string, token = adminToken) =>
  app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
const post = (url: string, payload?: unknown, token = adminToken) =>
  app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}` }, ...(payload !== undefined ? { payload } : {}) });
const auditActions = () => db.auditCreate.mock.calls.map((c) => c[0].data.action);

beforeEach(async () => {
  vi.clearAllMocks();
  settleDraw.mockResolvedValue(undefined);
  db.auditCreate.mockResolvedValue({});
  app = Fastify();
  await app.register(errorHandler);
  await app.register(authPlugin);
  await app.register(adminRoutes);
  await app.register(adminUsersRoutes);
  await app.register(adminMoneyRoutes);
  await app.ready();
  adminToken = app.jwt.sign({ sub: ADMIN, phone: '+972520000001', type: 'admin' });
});
afterEach(() => app.close());

describe('phone search normalisation', () => {
  it.each([
    ['0501234567', '+972501234567'],
    ['050-123-4567', '+972501234567'],
    ['+972 50 123 4567', '+972501234567'],
    ['972501234567', '+972501234567'],
    ['+9720501234567', '+972501234567'],
    ['501234567', '+972501234567'],
    ['0501', '+972501'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizePhoneQuery(raw)).toBe(expected);
  });

  it('refuses too few digits', () => {
    expect(normalizePhoneQuery('05')).toBeNull();
    expect(normalizePhoneQuery('+972')).toBeNull();
    expect(normalizePhoneQuery('abc')).toBeNull();
  });
});

describe('GET /admin/users?phone=', () => {
  it('prefix-matches the normalised phone, max 20, and returns only the allowed fields', async () => {
    db.userFindMany.mockResolvedValue([userRow()]);
    const res = await get('/admin/users?phone=050-123');
    expect(res.statusCode).toBe(200);
    const q = db.userFindMany.mock.calls[0][0];
    expect(q.where).toEqual({ phone: { startsWith: '+97250123' } });
    expect(q.take).toBe(20);
    expect(Object.keys(q.select).sort()).toEqual(
      ['createdAt', 'fullName', 'id', 'idLast4', 'phone', 'status', 'verifiedAdult', 'walletBalance'],
    );
    // A plain array, as the admin dashboard reads it; `balance` is the dashboard's name for walletBalance
    expect(res.json()).toEqual([{
      id: 'user-1',
      phone: '+972501234567',
      fullName: 'Dana Levi',
      walletBalance: '120.50',
      balance: '120.50',
      status: 'active',
      verifiedAdult: true,
      idLast4: '2782',
      createdAt: '2026-10-01T10:00:00.000Z',
    }]);
    expect(res.body).not.toContain('123456782');
    expect(res.body).not.toContain('v1:secret');
  });

  it('400 for a query with too few digits, 403 for a user token, 401 without a token', async () => {
    expect((await get('/admin/users?phone=05')).statusCode).toBe(400);
    expect((await get('/admin/users')).statusCode).toBe(400);
    expect((await get('/admin/users?phone=0501234567', app.jwt.sign({ sub: 'u', type: 'user' }))).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/admin/users?phone=0501234567' })).statusCode).toBe(401);
  });
});

describe('GET /admin/users/:id', () => {
  it('returns the user with the last 50 orders and wallet transactions', async () => {
    db.userFindUnique.mockResolvedValue(userRow());
    db.orderFindMany.mockResolvedValue([
      { id: 'o1', status: 'won', totalCharged: new Decimal('11'), createdAt: new Date('2026-11-01T00:00:00Z'), draw: { drawNumber: 3980 } },
      { id: 'o0', status: 'lost', totalCharged: new Decimal('5'), createdAt: new Date('2026-06-01T00:00:00Z'), draw: null },
    ]);
    db.walletTxFindMany.mockResolvedValue([
      { id: 'w1', type: 'charge', amount: new Decimal('11'), description: 'הזמנת לוטו 3980', createdAt: new Date('2026-11-01T00:00:00Z') },
    ]);
    const res = await get('/admin/users/user-1');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ id: 'user-1', idLast4: '2782', walletBalance: '120.50' });
    expect(body.idNumberEnc).toBeUndefined();
    expect(body.orders).toEqual([
      { id: 'o1', status: 'won', total: '11.00', drawNumber: 3980, createdAt: '2026-11-01T00:00:00.000Z' },
      { id: 'o0', status: 'lost', total: '5.00', drawNumber: null, createdAt: '2026-06-01T00:00:00.000Z' },
    ]);
    expect(body.walletTransactions).toEqual([
      { id: 'w1', type: 'charge', amount: '11.00', description: 'הזמנת לוטו 3980', createdAt: '2026-11-01T00:00:00.000Z' },
    ]);
    expect(db.orderFindMany.mock.calls[0][0]).toMatchObject({ where: { userId: 'user-1' }, orderBy: { createdAt: 'desc' }, take: 50 });
    expect(db.walletTxFindMany.mock.calls[0][0]).toMatchObject({ where: { userId: 'user-1' }, orderBy: { createdAt: 'desc' }, take: 50 });
  });

  it('404 for an unknown user', async () => {
    db.userFindUnique.mockResolvedValue(null);
    db.orderFindMany.mockResolvedValue([]);
    db.walletTxFindMany.mockResolvedValue([]);
    expect((await get('/admin/users/nope')).statusCode).toBe(404);
  });
});

describe('suspend / unsuspend', () => {
  it('suspends an active user once, audited with the reason; a repeat changes nothing', async () => {
    db.userUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    db.userFindUnique.mockResolvedValue(userRow({ status: 'suspended' }));

    const first = await post('/admin/users/user-1/suspend', { reason: 'chargeback fraud' });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ id: 'user-1', status: 'suspended', changed: true });
    expect(db.userUpdateMany.mock.calls[0][0]).toEqual({ where: { id: 'user-1', status: 'active' }, data: { status: 'suspended' } });
    expect(db.auditCreate).toHaveBeenCalledTimes(1);
    expect(db.auditCreate.mock.calls[0][0].data).toMatchObject({
      entityType: 'user', entityId: 'user-1', action: 'user:suspended', actorId: ADMIN, actorType: 'admin',
      metadata: { reason: 'chargeback fraud' },
    });

    const again = await post('/admin/users/user-1/suspend', { reason: 'chargeback fraud' });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ status: 'suspended', changed: false });
    expect(db.auditCreate).toHaveBeenCalledTimes(1);
  });

  it('unsuspends (reason optional), audited', async () => {
    db.userUpdateMany.mockResolvedValue({ count: 1 });
    db.userFindUnique.mockResolvedValue(userRow({ status: 'active' }));
    const res = await post('/admin/users/user-1/unsuspend');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'active', changed: true });
    expect(db.userUpdateMany.mock.calls[0][0]).toEqual({ where: { id: 'user-1', status: 'suspended' }, data: { status: 'active' } });
    expect(auditActions()).toEqual(['user:unsuspended']);
  });

  it('suspend works without a body (as the dashboard sends it); a too-short reason is 400; unknown user is 404', async () => {
    db.userUpdateMany.mockResolvedValueOnce({ count: 1 });
    db.userFindUnique.mockResolvedValueOnce(userRow({ status: 'suspended' }));
    const res = await post('/admin/users/user-1/suspend');
    expect(res.statusCode).toBe(200);
    expect(db.auditCreate.mock.calls[0][0].data).toMatchObject({ action: 'user:suspended', metadata: undefined });
    db.auditCreate.mockClear();

    expect((await post('/admin/users/user-1/suspend', { reason: 'x' })).statusCode).toBe(400);
    db.userUpdateMany.mockResolvedValue({ count: 0 });
    db.userFindUnique.mockResolvedValue(null);
    expect((await post('/admin/users/nope/suspend', { reason: 'test reason' })).statusCode).toBe(404);
    expect(db.auditCreate).not.toHaveBeenCalled();
  });
});

describe('GET /admin/audit', () => {
  const row = (fields: Record<string, unknown>) => ({
    id: 'a1', entityType: 'draw', entityId: 'd1', orderId: null, action: 'draw:results_confirmed',
    actorId: ADMIN, actorType: 'admin', metadata: { drawNumber: 3983 }, createdAt: new Date('2026-11-10T23:00:00Z'), ...fields,
  });

  it('filters by action prefix and dates, pages newest first, and adds the admin phone', async () => {
    db.auditFindMany.mockResolvedValue([row({}), row({ id: 'a2', actorId: 'system', actorType: 'system', action: 'draw:results_suggested' })]);
    db.auditCount.mockResolvedValue(57);
    db.adminFindMany.mockResolvedValue([{ id: ADMIN, phone: '+972520000001', name: 'Oz' }]);

    const res = await get('/admin/audit?action=draw:&from=2026-11-01T00:00:00Z&to=2026-11-30T00:00:00Z&page=2&pageSize=25');
    expect(res.statusCode).toBe(200);
    const q = db.auditFindMany.mock.calls[0][0];
    expect(q.where).toEqual({
      action: { startsWith: 'draw:' },
      createdAt: { gte: new Date('2026-11-01T00:00:00Z'), lte: new Date('2026-11-30T00:00:00Z') },
    });
    expect(q.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(q.skip).toBe(25);
    expect(q.take).toBe(25);
    expect(db.auditCount.mock.calls[0][0].where).toEqual(q.where);
    expect(db.adminFindMany.mock.calls[0][0].where).toEqual({ id: { in: [ADMIN] } });

    const body = res.json();
    expect(body).toMatchObject({ total: 57, page: 2, pageSize: 25 });
    expect(body.items[0]).toMatchObject({ id: 'a1', action: 'draw:results_confirmed', adminPhone: '+972520000001', adminName: 'Oz' });
    expect(body.items[1]).toMatchObject({ id: 'a2', actorType: 'system', adminPhone: null });
  });

  it('defaults to page 1 of 50 and caps pageSize at 200', async () => {
    db.auditFindMany.mockResolvedValue([]);
    db.auditCount.mockResolvedValue(0);
    const res = await get('/admin/audit');
    expect(res.json()).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
    expect(db.auditFindMany.mock.calls[0][0]).toMatchObject({ where: {}, skip: 0, take: 50 });
    expect(db.adminFindMany).not.toHaveBeenCalled();
    expect((await get('/admin/audit?pageSize=200')).statusCode).toBe(200);
    expect((await get('/admin/audit?pageSize=201')).statusCode).toBe(400);
    expect((await get('/admin/audit?from=yesterday')).statusCode).toBe(400);
  });

  it('a bare date is a whole day in Israel time', () => {
    // November: Israel is UTC+2
    expect(auditBound('2026-11-10', 'from').toISOString()).toBe('2026-11-09T22:00:00.000Z');
    expect(auditBound('2026-11-10', 'to').toISOString()).toBe('2026-11-10T21:59:59.999Z');
  });
});

describe('GET /admin/prize-claims', () => {
  const claimRow = (status: string) => ({
    id: `c-${status}`, orderId: 'o1', userId: 'user-1', amount: new Decimal('5000'), status,
    scheduledAt: status === 'scheduled' ? new Date('2026-12-01T09:00:00Z') : null, collectedAt: null,
    expiresAt: new Date('2027-05-01T00:00:00Z'), createdAt: new Date('2026-11-01T00:00:00Z'),
    user: { fullName: 'Dana Levi', phone: '+972501234567', idLast4: '2782' },
    order: { id: 'o1', draw: { drawNumber: 3980 } },
  });

  it('adds the claimant fields, scheduledAt and expiresAt', async () => {
    db.claimFindMany.mockResolvedValue([claimRow('scheduled')]);
    const res = await get('/admin/prize-claims');
    expect(res.statusCode).toBe(200);
    expect(res.json()[0]).toMatchObject({
      id: 'c-scheduled',
      status: 'scheduled',
      claimantName: 'Dana Levi',
      claimantPhone: '+972501234567',
      claimantIdLast4: '2782',
      drawNumber: 3980,
      scheduledAt: '2026-12-01T09:00:00.000Z',
      scheduledFor: '2026-12-01T09:00:00.000Z',
      expiresAt: '2027-05-01T00:00:00.000Z',
      user: { fullName: 'Dana Levi', phone: '+972501234567' },
      order: { id: 'o1', draw: { drawNumber: 3980 } },
    });
  });

  it.each(['awaiting_pickup', 'scheduled', 'collected', 'expired'])('filters by status=%s', async (status) => {
    db.claimFindMany.mockResolvedValue([claimRow(status)]);
    const res = await get(`/admin/prize-claims?status=${status}`);
    expect(res.statusCode).toBe(200);
    expect(db.claimFindMany.mock.calls[0][0].where).toEqual({ status });
  });

  it('rejects an unknown status', async () => {
    expect((await get('/admin/prize-claims?status=paid')).statusCode).toBe(400);
  });

  it.each(['scheduledAt', 'scheduledFor'])('schedule accepts the slot as %s', async (field) => {
    const slot = new Date(Date.now() + 3 * 24 * 3_600_000).toISOString();
    const claim = { ...claimRow('awaiting_pickup'), expiresAt: new Date(Date.now() + 100 * 24 * 3_600_000) };
    db.claimFindUnique.mockResolvedValue(claim);
    db.claimUpdateMany.mockResolvedValue({ count: 1 });
    const res = await post(`/admin/prize-claims/${claim.id}/schedule`, { [field]: slot });
    expect(res.statusCode).toBe(200);
    expect(db.claimUpdateMany.mock.calls[0][0].data).toEqual({ status: 'scheduled', scheduledAt: new Date(slot) });
    expect(auditActions()).toEqual(['prize_claim:awaiting_pickup->scheduled']);
  });
});

describe('GET /admin/draws', () => {
  const draw = { id: 'd1', drawNumber: 3983, status: 'settled', updatedAt: new Date('2026-11-11T00:00:00Z') };

  it('without paging keeps the old response: an array of the latest 50, now with updatedAt', async () => {
    db.drawFindMany.mockResolvedValue([draw]);
    const res = await get('/admin/draws?status=settled');
    expect(Array.isArray(res.json())).toBe(true);
    expect(res.json()[0].updatedAt).toBe('2026-11-11T00:00:00.000Z');
    const q = db.drawFindMany.mock.calls[0][0];
    expect(q).toMatchObject({ where: { status: 'settled' }, orderBy: { drawAt: 'desc' }, take: 50 });
    expect(q.select.updatedAt).toBe(true);
    expect(db.drawCount).not.toHaveBeenCalled();
  });

  it('with page/pageSize returns { items, total, page, pageSize }', async () => {
    db.drawFindMany.mockResolvedValue([draw]);
    db.drawCount.mockResolvedValue(31);
    const res = await get('/admin/draws?page=3&pageSize=10');
    expect(res.json()).toMatchObject({ total: 31, page: 3, pageSize: 10, items: [{ id: 'd1' }] });
    expect(db.drawFindMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 10 });
    expect((await get('/admin/draws?pageSize=201')).statusCode).toBe(400);
  });
});

describe('POST /admin/draws/:id/confirm with expectedUpdatedAt', () => {
  const REVIEWED = new Date('2026-11-10T22:30:00.123Z');
  const suggested = (updatedAt = REVIEWED) => ({
    id: 'd1',
    drawNumber: 3983,
    status: 'results_suggested',
    numbers: [1, 2, 3, 4, 5, 6],
    strong: 3,
    extraDigits: [1, 2, 3, 4, 5, 6],
    updatedAt,
    prizeTiers: [{ game: 'lotto', tier: '6+s' }, { game: 'double', tier: '6+s' }],
  });

  it('confirms when the draw is unchanged since review', async () => {
    db.drawFindUnique.mockResolvedValue(suggested());
    db.drawUpdateMany.mockResolvedValue({ count: 1 });
    const res = await post('/admin/draws/d1/confirm', { expectedUpdatedAt: REVIEWED.toISOString() });
    expect(res.statusCode).toBe(200);
    expect(db.drawUpdateMany.mock.calls[0][0].where).toEqual({ id: 'd1', status: 'results_suggested', updatedAt: REVIEWED });
    expect(auditActions()).toEqual(['draw:results_confirmed']);
    expect(settleDraw).toHaveBeenCalledWith('d1');
  });

  it('409 RESULTS_CHANGED when the draw was edited after the review', async () => {
    db.drawFindUnique.mockResolvedValue(suggested(new Date('2026-11-10T22:31:00Z')));
    const res = await post('/admin/draws/d1/confirm', { expectedUpdatedAt: REVIEWED.toISOString() });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('RESULTS_CHANGED');
    expect(db.drawUpdateMany).not.toHaveBeenCalled();
    expect(db.auditCreate).not.toHaveBeenCalled();
  });

  it('409 RESULTS_CHANGED when an edit lands between the read and the update', async () => {
    db.drawFindUnique.mockResolvedValue(suggested());
    db.drawUpdateMany.mockResolvedValue({ count: 0 });
    const res = await post('/admin/draws/d1/confirm', { expectedUpdatedAt: REVIEWED.toISOString() });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('RESULTS_CHANGED');
    expect(db.auditCreate).not.toHaveBeenCalled();
  });

  it('without expectedUpdatedAt behaves as before (no body needed)', async () => {
    db.drawFindUnique.mockResolvedValue(suggested());
    db.drawUpdateMany.mockResolvedValue({ count: 1 });
    const res = await post('/admin/draws/d1/confirm');
    expect(res.statusCode).toBe(200);
    expect(db.drawUpdateMany.mock.calls[0][0].where).toEqual({ id: 'd1', status: 'results_suggested' });
  });

  it('rejects a malformed expectedUpdatedAt', async () => {
    expect((await post('/admin/draws/d1/confirm', { expectedUpdatedAt: 'yesterday' })).statusCode).toBe(400);
  });
});
