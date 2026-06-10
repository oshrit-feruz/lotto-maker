import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Mock external services before any module imports them
vi.mock('../../src/storage/r2.service.js', () => ({
  r2Service: {
    upload: vi.fn().mockResolvedValue('https://cdn.example.com/scans/test.jpg'),
    getSignedUrl: vi.fn().mockResolvedValue('https://cdn.example.com/scans/test.jpg?sig=mock'),
  },
}));

vi.mock('twilio', () => ({
  default: vi.fn(() => ({
    messages: { create: vi.fn().mockResolvedValue({ sid: 'SM_mock' }) },
  })),
}));

vi.mock('firebase-admin', () => ({
  default: { initializeApp: vi.fn(), messaging: vi.fn(() => ({ send: vi.fn() })) },
}));

// Control fetchDrawResults per test
const mockFetchDrawResults = vi.fn();
vi.mock('../../src/modules/results/results.service.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/modules/results/results.service.js')>();
  return { ...original, fetchDrawResults: mockFetchDrawResults };
});

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const skip = !TEST_DB_URL;

describe.skipIf(skip)('Full e2e flow', () => {
  let app: FastifyInstance;
  let prisma: import('@prisma/client').PrismaClient;

  // Tokens for user and operator
  let userAccessToken: string;
  let operatorToken: string;

  // IDs set during the test
  let locationId: string;
  let operatorId: string;
  let orderId: string;
  let slotId: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/server.js');
    const { prisma: db } = await import('../../src/prisma.js');
    const { redis } = await import('../../src/redis.js');

    prisma = db;
    app = await buildApp();
    await app.ready();

    // Clean slate
    await prisma.auditLog.deleteMany();
    await prisma.walletTransaction.deleteMany();
    await prisma.queueSlot.deleteMany();
    await prisma.order.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.user.deleteMany();
    await prisma.operator.deleteMany();
    await prisma.location.deleteMany();

    // Flush Redis test keys (prefix-safe flush)
    await redis.flushdb();

    // Seed: one location + one operator with low throughput (2/hr) so CB rejects 2nd order
    const location = await prisma.location.create({
      data: {
        name: 'Test Branch',
        address: '1 Test St',
        activeHours: { open: '08:00', close: '22:00' },
        active: true,
      },
    });
    locationId = location.id;

    const operator = await prisma.operator.create({
      data: {
        name: 'Test Op',
        locationId,
        active: true,
        throughputPerHour: 2,
      },
    });
    operatorId = operator.id;

    // Operator JWT (sub = operator.id, type = 'operator')
    operatorToken = app.jwt.sign({ sub: operatorId, type: 'operator' });
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Step 1: OTP send ────────────────────────────────────────────────────────

  it('sends OTP and respects rate limit on 4th request', async () => {
    const phone = '+972501234567';

    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: 'POST', url: '/auth/send-otp', payload: { phone } });
      expect(res.statusCode, `request ${i + 1} should succeed`).toBe(200);
    }

    const res = await app.inject({ method: 'POST', url: '/auth/send-otp', payload: { phone } });
    expect(res.statusCode).toBe(429);
    expect(res.json().retryAfter).toBeGreaterThan(0);
  });

  // ─── Step 2: OTP verify + issue tokens ───────────────────────────────────────

  it('verifies OTP and issues JWT tokens', async () => {
    const phone = '+972507654321'; // fresh phone to avoid rate limit
    const { redis } = await import('../../src/redis.js');

    // Manually store OTP so we know the code
    const { storeOtp } = await import('../../src/modules/auth/otp.store.js');
    await storeOtp(phone, '123456');

    // send-otp first to record the rate limit entry
    await app.inject({ method: 'POST', url: '/auth/send-otp', payload: { phone } });
    // Re-store to ensure correct code
    await storeOtp(phone, '123456');

    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { phone, code: '123456' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ accessToken: string; refreshToken: string; isNewUser: boolean }>();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.isNewUser).toBe(true);
    userAccessToken = body.accessToken;
  });

  // ─── Step 3: Refresh token rotation ─────────────────────────────────────────

  it('rotates refresh token and rejects reused token', async () => {
    const phone = '+972509999999';
    const { storeOtp } = await import('../../src/modules/auth/otp.store.js');
    await storeOtp(phone, '654321');

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { phone, code: '654321' },
    });
    const { refreshToken: original } = verifyRes.json<{ accessToken: string; refreshToken: string }>();

    // First refresh → success + new tokens
    const r1 = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: original },
    });
    expect(r1.statusCode).toBe(200);
    const { accessToken: a1, refreshToken: rotated } = r1.json<{ accessToken: string; refreshToken: string }>();
    expect(a1).toBeTruthy();
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(original);

    // Reuse original → 401 (already deleted)
    const r2 = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: original },
    });
    expect(r2.statusCode).toBe(401);
  });

  // ─── Step 4: KYC ─────────────────────────────────────────────────────────────

  it('blocks underage KYC and allows adult KYC', async () => {
    // underage
    const under = await app.inject({
      method: 'POST',
      url: '/me/kyc',
      headers: { authorization: `Bearer ${userAccessToken}` },
      payload: { fullName: 'Young User', idNumber: '111111111', dateOfBirth: '2015-01-01' },
    });
    expect(under.statusCode).toBe(403);

    // adult
    const adult = await app.inject({
      method: 'POST',
      url: '/me/kyc',
      headers: { authorization: `Bearer ${userAccessToken}` },
      payload: { fullName: 'Adult User', idNumber: '123456789', dateOfBirth: '1990-05-15' },
    });
    expect(adult.statusCode).toBe(200);
    expect(adult.json().verifiedAdult).toBe(true);
  });

  // ─── Step 5: Wallet deposit ───────────────────────────────────────────────────

  it('deposits funds and writes an audit log entry', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wallet/deposit',
      headers: { authorization: `Bearer ${userAccessToken}` },
      payload: { amount: 100 },
    });

    expect(res.statusCode).toBe(200);
    expect(parseFloat(res.json().newBalance)).toBeGreaterThanOrEqual(100);

    // Confirm audit log was written inside the transaction
    const userId = app.jwt.decode<{ sub: string }>(userAccessToken)!.sub;
    const auditEntries = await prisma.auditLog.findMany({
      where: { entityType: 'wallet', entityId: userId, action: 'wallet:deposit' },
    });
    expect(auditEntries.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Step 6: Create order (circuit breaker accepts) ─────────────────────────

  it('creates a lotto order and writes a charge audit log', async () => {
    const userId = app.jwt.decode<{ sub: string }>(userAccessToken)!.sub;

    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${userAccessToken}` },
      payload: {
        gameType: 'lotto',
        numbers: [1, 2, 3, 4, 5, 6],
        strongNumber: 3,
        type: 'one_time',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ orderId: string; status: string }>();
    expect(body.status).toBe('in_queue');
    orderId = body.orderId;

    // Queue slot should exist
    const slot = await prisma.queueSlot.findFirst({ where: { orderId } });
    expect(slot).toBeTruthy();
    slotId = slot!.id;

    // Charge audit log written inside transaction
    const chargeAudit = await prisma.auditLog.findMany({
      where: { entityType: 'wallet', entityId: userId, action: 'wallet:charge' },
    });
    expect(chargeAudit.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Step 7: Circuit breaker rejects 2nd order ───────────────────────────────

  it('rejects a second order when circuit breaker capacity is exhausted', async () => {
    // throughput=2/hr, minutesLeft≈(hard cutoff to draw), 1 slot already in queue
    // gross=2*(minutesLeft/60) ≈ 2 for ~60min window → available=2-1=1, buffer=ceil(2*0.1)=1 → rejected
    // Ensure this by setting throughput very low
    await prisma.operator.update({
      where: { id: operatorId },
      data: { throughputPerHour: 1 },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${userAccessToken}` },
      payload: {
        gameType: 'lotto',
        numbers: [7, 8, 9, 10, 11, 12],
        strongNumber: 5,
        type: 'one_time',
      },
    });

    expect(res.statusCode).toBe(503);

    // Restore operator throughput
    await prisma.operator.update({
      where: { id: operatorId },
      data: { throughputPerHour: 50 },
    });
  });

  // ─── Step 8: Operator picks up slot ──────────────────────────────────────────

  it('operator starts the queue slot', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/operator/queue/${slotId}/start`,
      headers: { authorization: `Bearer ${operatorToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('in_progress');
  });

  // ─── Step 9: Operator marks slot done (keyed) ─────────────────────────────────

  it('operator completes the slot → order becomes keyed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/operator/queue/${slotId}/done`,
      headers: { authorization: `Bearer ${operatorToken}` },
    });

    expect(res.statusCode).toBe(200);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('keyed');
  });

  // ─── Step 10: Operator uploads scan ──────────────────────────────────────────

  it('operator uploads scan → order becomes scanned', async () => {
    const boundary = '----FormBoundary7MA4YWxkTrZu0gW';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="scan.jpg"',
      'Content-Type: image/jpeg',
      '',
      'fake-image-bytes',
      `--${boundary}--`,
    ].join('\r\n');

    const res = await app.inject({
      method: 'POST',
      url: `/operator/queue/${slotId}/scan`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().scanUrl).toBeTruthy();

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('scanned');
  });

  // ─── Step 11: Results processing → won ───────────────────────────────────────

  it('processes results: winning order → wallet credited with audit log', async () => {
    const userId = app.jwt.decode<{ sub: string }>(userAccessToken)!.sub;

    const balanceBefore = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true },
    });

    // Mock results: numbers 1-6 with strong 3 — exact match → win
    const { fetchDrawResults } = await import('../../src/modules/results/results.service.js');
    (fetchDrawResults as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      numbers: [1, 2, 3, 4, 5, 6],
      strongNumber: 3,
    });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    const { processResultsWithRetry } = await import('../../src/modules/results/results.service.js');
    await processResultsWithRetry('lotto', order!.drawDate);

    const updatedOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(updatedOrder?.status).toBe('won');

    const balanceAfter = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true },
    });

    const diff = parseFloat(balanceAfter!.walletBalance.toString())
      - parseFloat(balanceBefore!.walletBalance.toString());
    expect(diff).toBeGreaterThan(0);

    // Winning audit log inside the wallet transaction
    const winAudit = await prisma.auditLog.findMany({
      where: { entityType: 'wallet', entityId: userId, action: 'wallet:winning' },
    });
    expect(winAudit.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Step 12: Results delayed after retries exhausted ────────────────────────

  it('marks orders as results_delayed after 3 failed fetch attempts', async () => {
    // Create a second user + order in scanned state
    const phone2 = '+972502222222';
    const { storeOtp } = await import('../../src/modules/auth/otp.store.js');
    await storeOtp(phone2, '777777');
    const verRes = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { phone: phone2, code: '777777' },
    });
    const { accessToken: t2 } = verRes.json<{ accessToken: string }>();
    const userId2 = app.jwt.decode<{ sub: string }>(t2)!.sub;

    await app.inject({
      method: 'POST',
      url: '/me/kyc',
      headers: { authorization: `Bearer ${t2}` },
      payload: { fullName: 'User Two', idNumber: '987654321', dateOfBirth: '1985-03-20' },
    });

    await app.inject({
      method: 'POST',
      url: '/wallet/deposit',
      headers: { authorization: `Bearer ${t2}` },
      payload: { amount: 50 },
    });

    const orderRes = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${t2}` },
      payload: { gameType: 'lotto', numbers: [2, 4, 6, 8, 10, 12], strongNumber: 1, type: 'one_time' },
    });
    const orderId2 = orderRes.json<{ orderId: string }>().orderId;

    // Force order to scanned state
    await prisma.order.update({ where: { id: orderId2 }, data: { status: 'scanned' } });
    const order2 = await prisma.order.findUnique({ where: { id: orderId2 } });

    // fetchDrawResults always returns null → exhausts retries immediately (attemptsLeft=1)
    mockFetchDrawResults.mockResolvedValue(null);

    const { markResultsDelayed } = await import('../../src/modules/results/results.service.js');
    await markResultsDelayed('lotto', order2!.drawDate);

    const delayed = await prisma.order.findUnique({ where: { id: orderId2 } });
    expect(delayed?.status).toBe('results_delayed');

    const delayedAudit = await prisma.auditLog.findMany({
      where: { entityType: 'order', entityId: orderId2, action: 'status_change:scanned->results_delayed' },
    });
    expect(delayedAudit.length).toBeGreaterThanOrEqual(1);
  });
});
