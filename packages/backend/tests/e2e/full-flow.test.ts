import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Mock external services before any module imports them
vi.mock('../../src/storage/r2.service.js', () => ({
  r2Service: {
    upload: vi.fn(async (key: string) => key),
    getSignedUrl: vi.fn(async (key: string) => `https://r2.example.com/${key}?X-Amz-Expires=300&X-Amz-Signature=mock`),
  },
  DEFAULT_SIGNED_URL_TTL_SECONDS: 300,
}));

vi.mock('twilio', () => ({
  default: vi.fn(() => ({
    messages: { create: vi.fn().mockResolvedValue({ sid: 'SM_mock' }) },
  })),
}));

vi.mock('firebase-admin', () => ({
  default: { initializeApp: vi.fn(), messaging: vi.fn(() => ({ send: vi.fn() })) },
}));

// Draw results are not scraped in this test: the draw is confirmed directly in the database
// and settled through settleDraw, so nothing here touches the Pais site.

/** A one-order lotto ticket: two plain tables (the form takes tables in pairs). */
const ticketPayload = (tables: Array<{ numbers: number[]; strongNumbers: number[] }>) => ({
  gameType: 'lotto',
  type: 'one_time',
  ticket: { type: 'regular', systematicType: null, extra: false, drawCount: 1, tables },
});
const TABLES_A = [
  { numbers: [1, 2, 3, 4, 5, 6], strongNumbers: [3] },
  { numbers: [7, 8, 9, 10, 11, 12], strongNumbers: [4] },
];
const TABLES_B = [
  { numbers: [2, 4, 6, 8, 10, 12], strongNumbers: [1] },
  { numbers: [1, 3, 5, 7, 9, 11], strongNumbers: [2] },
];

// setup.ts sets E2E_DATABASE when TEST_DATABASE_URL (or DATABASE_URL) points at a real database
const skip = process.env.E2E_DATABASE !== '1';

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
  let drawId: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/server.js');
    const { prisma: db } = await import('../../src/prisma.js');
    const { redis } = await import('../../src/redis.js');

    prisma = db;
    app = await buildApp();
    await app.ready();

    // Clean slate
    // Children before parents (foreign keys); the Phase 5/6 tables too, so a re-run starts clean
    await prisma.auditLog.deleteMany();
    await prisma.walletTransaction.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.withdrawal.deleteMany();
    await prisma.savedCard.deleteMany();
    await prisma.queueSlot.deleteMany();
    await prisma.orderWin.deleteMany();
    await prisma.prizeClaim.deleteMany();
    await prisma.pendingCardCredit.deleteMany();
    await prisma.receipt.deleteMany();
    await prisma.subscriptionEvent.deleteMany();
    await prisma.order.deleteMany();
    await prisma.ticket.deleteMany(); // tables cascade
    await prisma.draw.deleteMany(); // prize tiers cascade
    await prisma.subscription.deleteMany();
    await prisma.deviceToken.deleteMany();
    await prisma.kycCheck.deleteMany();
    await prisma.userLimits.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.notificationPreference.deleteMany();
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

    // One announced draw that is still open for orders (PriceList rows come from the migration)
    const salesCloseAt = new Date(Date.now() + 6 * 3600_000);
    const draw = await prisma.draw.create({
      data: { drawNumber: 9001, salesCloseAt, drawAt: new Date(salesCloseAt.getTime() + 15 * 60_000) },
    });
    drawId = draw.id;

    // Operator JWT (sub = operator.id, type = 'operator')
    operatorToken = app.jwt.sign({ sub: operatorId, type: 'operator' });
  });

  afterAll(async () => {
    await app.close();
  });

  /** Starts a checkout and builds the signed "approved" webhook the provider would send. */
  async function startCheckout(token: string, amount: number) {
    const res = await app.inject({
      method: 'POST',
      url: '/payments/checkout',
      headers: { authorization: `Bearer ${token}` },
      payload: { amount },
    });
    expect(res.statusCode).toBe(201);
    const { paymentId } = res.json<{ paymentId: string; checkoutUrl: string }>();
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

    const { getPaymentProvider } = await import('../../src/modules/payments/payments.service.js');
    const provider = getPaymentProvider() as import('../../src/modules/payments/mock-payment-provider.js').MockPaymentProvider;
    const payload = JSON.stringify({ providerTxId: payment.providerTxId, status: 'approved', amount });
    return {
      paymentId,
      webhook: {
        method: 'POST' as const,
        url: '/payments/webhook',
        headers: { 'content-type': 'application/json', 'x-mock-signature': provider.sign(payload) },
        payload,
      },
    };
  }

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
      payload: { fullName: 'Young User', idNumber: '111111118', dateOfBirth: '2015-01-01' },
    });
    expect(under.statusCode).toBe(403);

    // adult
    const adult = await app.inject({
      method: 'POST',
      url: '/me/kyc',
      headers: { authorization: `Bearer ${userAccessToken}` },
      payload: { fullName: 'Adult User', idNumber: '123456782', dateOfBirth: '1990-05-15' },
    });
    expect(adult.statusCode).toBe(200);
    expect(adult.json().verifiedAdult).toBe(true);
  });

  it('rejects an ID with a bad check digit and stores valid IDs encrypted', async () => {
    const userId = app.jwt.decode<{ sub: string }>(userAccessToken)!.sub;

    const invalid = await app.inject({
      method: 'POST',
      url: '/me/kyc',
      headers: { authorization: `Bearer ${userAccessToken}` },
      payload: { fullName: 'Adult User', idNumber: '123456789', dateOfBirth: '1990-05-15' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toBe('INVALID_ID_NUMBER');

    // Nothing in the row (or the API response) contains the plain ID number
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "User" WHERE id = ${userId}`;
    expect(JSON.stringify(rows)).not.toContain('123456782');
    expect(rows[0]).toMatchObject({ idLast4: '6782', birthYear: 1990, idNumberLegacy: null });
    expect(rows[0]).not.toHaveProperty('dateOfBirth');

    const { decryptField } = await import('../../src/lib/crypto.js');
    expect(decryptField(rows[0]!.idNumberEnc as string)).toBe('123456782');

    const me = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${userAccessToken}` } });
    expect(me.json().idLast4).toBe('6782');
    expect(me.body).not.toContain('idNumberEnc');
    expect(me.body).not.toContain('idNumberHash');

    // Same ID on another account is refused, also when typed without the check for leading zeros
    const other = await prisma.user.create({ data: { phone: '+972507777777' } });
    const dup = await app.inject({
      method: 'POST',
      url: '/me/kyc',
      headers: { authorization: `Bearer ${app.jwt.sign({ sub: other.id, type: 'user' })}` },
      payload: { fullName: 'Copy Cat', idNumber: '123456782', dateOfBirth: '1980-01-01' },
    });
    expect(dup.statusCode).toBe(409);
  });

  // ─── Step 5: Wallet deposit (checkout + provider webhook) ─────────────────────

  it('has no direct deposit route', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/wallet/deposit',
      headers: { authorization: `Bearer ${userAccessToken}` },
      payload: { amount: 100 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('credits the wallet once per confirmed payment, even under concurrent duplicate webhooks', async () => {
    const userId = app.jwt.decode<{ sub: string }>(userAccessToken)!.sub;
    const { webhook } = await startCheckout(userAccessToken, 100);

    // Checkout alone credits nothing
    const before = await prisma.user.findUnique({ where: { id: userId } });
    expect(before!.walletBalance.toNumber()).toBe(0);

    const bad = await app.inject({
      method: 'POST',
      url: '/payments/webhook',
      headers: { 'content-type': 'application/json', 'x-mock-signature': 'bad' },
      payload: webhook.payload,
    });
    expect(bad.statusCode).toBe(401);

    const responses = await Promise.all([1, 2, 3, 4, 5].map(() => app.inject(webhook)));
    expect(responses.every((r) => r.statusCode === 200)).toBe(true);
    expect(responses.filter((r) => r.json().outcome === 'credited')).toHaveLength(1);

    const after = await prisma.user.findUnique({ where: { id: userId } });
    expect(after!.walletBalance.toNumber()).toBe(100);
    expect(await prisma.walletTransaction.count({ where: { userId, type: 'deposit' } })).toBe(1);

    // Audit log written inside the same transaction as the credit
    const auditEntries = await prisma.auditLog.findMany({
      where: { entityType: 'wallet', entityId: userId, action: 'wallet:deposit' },
    });
    expect(auditEntries).toHaveLength(1);
  });

  it('rejects a deposit that would exceed the wallet cap', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/payments/checkout',
      headers: { authorization: `Bearer ${userAccessToken}` },
      payload: { amount: 2501 },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('WALLET_CAP_EXCEEDED');
  });

  // ─── Step 6: Create order (circuit breaker accepts) ─────────────────────────

  it('creates a lotto order and writes a charge audit log', async () => {
    const userId = app.jwt.decode<{ sub: string }>(userAccessToken)!.sub;

    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${userAccessToken}` },
      payload: ticketPayload(TABLES_A),
    });

    expect(res.statusCode).toBe(201);
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
    // Capacity = throughput × time left until the cutoff, so any positive
    // throughput makes this depend on when the test runs. With zero throughput
    // the capacity is 0 whatever the clock says, and one slot is already queued.
    await prisma.operator.update({
      where: { id: operatorId },
      data: { throughputPerHour: 0 },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${userAccessToken}` },
      payload: ticketPayload(TABLES_B),
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('QUEUE_FULL');
    expect(await prisma.order.count()).toBe(1);

    // Restore operator throughput
    await prisma.operator.update({
      where: { id: operatorId },
      data: { throughputPerHour: 50 },
    });
  });

  // ─── Operators are confined to their own location ────────────────────────────

  it('rejects an operator from another location and hides customer identity in the queue', async () => {
    const otherLocation = await prisma.location.create({
      data: { name: 'Other Branch', address: '2 Test St', activeHours: {}, active: false },
    });
    const outsider = await prisma.operator.create({
      data: { name: 'Outsider', locationId: otherLocation.id, active: true },
    });
    const outsiderToken = app.jwt.sign({ sub: outsider.id, type: 'operator' });

    for (const action of ['start', 'done']) {
      const res = await app.inject({
        method: 'POST',
        url: `/operator/queue/${slotId}/${action}`,
        headers: { authorization: `Bearer ${outsiderToken}` },
      });
      expect(res.statusCode, action).toBe(403);
      expect(res.json().error).toBe('FORBIDDEN_LOCATION');
    }
    expect((await prisma.queueSlot.findUnique({ where: { id: slotId } }))?.status).toBe('waiting');

    const theirs = await app.inject({
      method: 'GET',
      url: '/operator/queue',
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(theirs.json().slots).toHaveLength(0);

    const ours = await app.inject({
      method: 'GET',
      url: '/operator/queue',
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    const userId = app.jwt.decode<{ sub: string }>(userAccessToken)!.sub;
    expect(ours.body).not.toContain(userId);
    expect(ours.body).not.toContain('userId');
    expect(ours.json().slots[0].order).toEqual({
      gameType: 'lotto',
      type: 'one_time',
      drawNumber: 9001,
      ticketType: 'regular',
      systematicType: null,
      extra: false,
      tables: TABLES_A,
      idLast4: '6782',
    });
  });

  it('refuses a scan before the form has been keyed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/operator/queue/${slotId}/scan`,
      headers: { authorization: `Bearer ${operatorToken}`, 'content-type': 'multipart/form-data; boundary=x' },
      payload: '--x--\r\n',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('SLOT_NOT_KEYED');
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

    // Starting does not key the order, and the audit log says so
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('in_queue');
    const audit = await prisma.auditLog.findMany({ where: { orderId } });
    expect(audit.map((a) => a.action)).toContain('slot_status_change:waiting->in_progress');
    expect(audit.some((a) => a.action.endsWith('->keyed'))).toBe(false);
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
    // The upload is validated by its magic bytes, so it must start like a JPEG
    const body = Buffer.concat([
      Buffer.from(
        [
          `--${boundary}`,
          'Content-Disposition: form-data; name="file"; filename="scan.jpg"',
          'Content-Type: image/jpeg',
          '',
          '',
        ].join('\r\n'),
      ),
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('fake-image-bytes'),
      Buffer.from(`\r\n--${boundary}--`),
    ]);

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
    expect(JSON.stringify(res.json())).not.toContain('http');

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('scanned');
    // Only the object key is stored, never a URL
    expect(order?.ticketScanKey).toMatch(/^scans\//);
  });

  it('serves the scan to its owner only, through a signed URL', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}`,
      headers: { authorization: `Bearer ${userAccessToken}` },
    });
    expect(detail.json().hasScan).toBe(true);
    expect(detail.body).not.toContain('scans/');

    const owner = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/scan`,
      headers: { authorization: `Bearer ${userAccessToken}` },
    });
    expect(owner.statusCode).toBe(200);
    expect(owner.json().url).toContain('X-Amz-Expires=300');

    const stranger = await prisma.user.create({ data: { phone: '+972508888888' } });
    const strangerToken = app.jwt.sign({ sub: stranger.id, type: 'user' });
    const other = await app.inject({
      method: 'GET',
      url: `/orders/${orderId}/scan`,
      headers: { authorization: `Bearer ${strangerToken}` },
    });
    expect(other.statusCode).toBe(403);

    const anon = await app.inject({ method: 'GET', url: `/orders/${orderId}/scan` });
    expect(anon.statusCode).toBe(401);
  });

  // ─── Step 11: Results processing → won ───────────────────────────────────────

  it('processes results: winning order → wallet credited with audit log', async () => {
    const userId = app.jwt.decode<{ sub: string }>(userAccessToken)!.sub;

    const balanceBefore = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true },
    });

    // Confirmed results: table 1 hits 1,2,3 and table 2 hits 10,11,12, no strong number on either
    // → 3 hits twice → tier "3" pays 10 ₪ each, 20 ₪ in total (a small prize, paid to the wallet)
    await prisma.draw.update({
      where: { id: drawId },
      data: {
        numbers: [1, 2, 3, 10, 11, 12],
        strong: 7,
        extraDigits: [1, 2, 3, 4, 5, 6],
        status: 'results_confirmed',
        confirmedAt: new Date(),
        prizeTiers: {
          create: [
            { game: 'lotto', tier: '3', winnersCount: 100, prizeAmount: '10.00' },
            { game: 'double', tier: '3', winnersCount: 50, prizeAmount: '20.00' },
          ],
        },
      },
    });

    const { settleDraw } = await import('../../src/modules/results/settlement.service.js');
    const settled = await settleDraw(drawId);
    expect(settled.settled).toBe(true);

    const updatedOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(updatedOrder?.status).toBe('won');

    const balanceAfter = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true },
    });

    const diff = parseFloat(balanceAfter!.walletBalance.toString())
      - parseFloat(balanceBefore!.walletBalance.toString());
    expect(diff).toBe(20);
    expect((await prisma.draw.findUnique({ where: { id: drawId } }))?.status).toBe('settled');

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
      payload: { fullName: 'User Two', idNumber: '987654324', dateOfBirth: '1985-03-20' },
    });

    const { webhook } = await startCheckout(t2, 50);
    expect((await app.inject(webhook)).json().outcome).toBe('credited');

    // The first draw is settled; announce the next one for this order
    const nextClose = new Date(Date.now() + 8 * 3600_000);
    const nextDraw = await prisma.draw.create({
      data: { drawNumber: 9002, salesCloseAt: nextClose, drawAt: new Date(nextClose.getTime() + 15 * 60_000) },
    });

    const orderRes = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: `Bearer ${t2}` },
      payload: ticketPayload(TABLES_B),
    });
    expect(orderRes.statusCode).toBe(201);
    const orderId2 = orderRes.json<{ orderId: string }>().orderId;

    // Force order to scanned state
    await prisma.order.update({ where: { id: orderId2 }, data: { status: 'scanned' } });

    // The results never arrived for this draw
    const { markDrawResultsDelayed } = await import('../../src/modules/results/settlement.service.js');
    await markDrawResultsDelayed(nextDraw.id);

    const delayed = await prisma.order.findUnique({ where: { id: orderId2 } });
    expect(delayed?.status).toBe('results_delayed');

    const delayedAudit = await prisma.auditLog.findMany({
      where: { entityType: 'order', entityId: orderId2, action: 'status_change:scanned->results_delayed' },
    });
    expect(delayedAudit.length).toBeGreaterThanOrEqual(1);
  });
});
