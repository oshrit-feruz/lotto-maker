import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

/* eslint-disable @typescript-eslint/no-explicit-any */

const m = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  redis: { del: vi.fn(), setex: vi.fn(), get: vi.fn() },
  prisma: {
    admin: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    operator: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn() },
  },
}));
vi.mock('../../src/redis.js', () => ({ redis: m.redis }));
vi.mock('../../src/prisma.js', () => ({ prisma: m.prisma }));
vi.mock('../../src/modules/auth/otp.store.js', () => ({
  verifyOtp: m.verifyOtp,
  storeOtp: vi.fn(),
  checkOtpRateLimit: vi.fn(),
}));

import { config } from '../../src/config.js';
import errorHandler from '../../src/plugins/error-handler.js';
import authPlugin from '../../src/plugins/auth.js';
import authRoutes from '../../src/modules/auth/auth.routes.js';

const PHONE = '+972501234567';
const ADMIN = { id: 'admin-1', phone: PHONE, active: true };
const OPERATOR = { id: 'op-1', phone: PHONE, active: true };
const INACTIVE_OPERATOR = { ...OPERATOR, active: false };
const USER = { id: 'user-1', phone: PHONE };

type Rows = { admin?: object | null; operator?: object | null };

let app: FastifyInstance;

function givenRows({ admin = null, operator = null }: Rows) {
  m.prisma.admin.findUnique.mockResolvedValue(admin);
  m.prisma.operator.findUnique.mockResolvedValue(operator);
}

const verify = (payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/auth/verify-otp', payload: { phone: PHONE, code: '123456', ...payload } });

const decode = (token: string) => app.jwt.decode<{ sub: string; type: string }>(token)!;
const decodeRefresh = (token: string) =>
  (app.jwt.verify as any)(token, { key: config.JWT_REFRESH_SECRET }) as { sub: string; type: string };

beforeEach(async () => {
  vi.clearAllMocks();
  m.verifyOtp.mockResolvedValue('ok');
  m.redis.del.mockResolvedValue(1);
  m.prisma.user.findUnique.mockResolvedValue(USER);
  m.prisma.user.create.mockResolvedValue(USER);
  app = Fastify();
  await app.register(errorHandler);
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.ready();
});
afterEach(() => app.close());

describe('verify-otp audience', () => {
  const allStaff = { admin: ADMIN, operator: OPERATOR };

  it.each([
    // audience, rows on the phone, expected status, expected token type + sub (or error code)
    ['user', {}, 200, 'user', 'user-1'],
    ['user', allStaff, 200, 'user', 'user-1'],
    ['user', { operator: INACTIVE_OPERATOR }, 200, 'user', 'user-1'],
    [undefined, allStaff, 200, 'user', 'user-1'],
    ['admin', allStaff, 200, 'admin', 'admin-1'],
    ['admin', { admin: ADMIN }, 200, 'admin', 'admin-1'],
    ['admin', { admin: { ...ADMIN, active: false }, operator: OPERATOR }, 403, 'NOT_AN_ADMIN'],
    ['admin', { operator: OPERATOR }, 403, 'NOT_AN_ADMIN'],
    ['admin', {}, 403, 'NOT_AN_ADMIN'],
    ['operator', allStaff, 200, 'operator', 'op-1'],
    ['operator', { operator: OPERATOR }, 200, 'operator', 'op-1'],
    ['operator', { admin: ADMIN, operator: INACTIVE_OPERATOR }, 403, 'NOT_AN_OPERATOR'],
    ['operator', { admin: ADMIN }, 403, 'NOT_AN_OPERATOR'],
    ['operator', {}, 403, 'NOT_AN_OPERATOR'],
  ] as const)('audience=%s rows=%j → %i %s', async (audience, rows, status, typeOrCode, sub?: string) => {
    givenRows(rows as Rows);
    const res = await verify(audience ? { audience } : {});
    expect(res.statusCode).toBe(status);
    if (status !== 200) {
      expect(res.json().error).toBe(typeOrCode);
      expect(m.prisma.user.create).not.toHaveBeenCalled();
      expect(m.redis.setex).not.toHaveBeenCalled();
      return;
    }
    const body = res.json();
    expect(decode(body.accessToken)).toMatchObject({ sub, type: typeOrCode });
    expect(decodeRefresh(body.refreshToken)).toMatchObject({ sub, type: typeOrCode });
    expect(m.redis.setex).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^refresh:${sub}:`)), expect.any(Number), '1');
  });

  it('creates the customer account for a new phone only on the user audience', async () => {
    givenRows({ admin: ADMIN });
    m.prisma.user.findUnique.mockResolvedValue(null);
    const res = await verify({ audience: 'user' });
    expect(res.json().isNewUser).toBe(true);
    expect(m.prisma.user.create).toHaveBeenCalledWith({ data: { phone: PHONE } });

    vi.clearAllMocks();
    givenRows({ admin: ADMIN });
    const adminRes = await verify({ audience: 'admin' });
    expect(adminRes.json().isNewUser).toBe(false);
    expect(m.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(m.prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown audience', async () => {
    const res = await verify({ audience: 'superuser' });
    expect(res.statusCode).toBe(400);
    expect(m.verifyOtp).not.toHaveBeenCalled();
  });

  it('checks the OTP before anything else', async () => {
    m.verifyOtp.mockResolvedValue('invalid');
    givenRows({ admin: ADMIN });
    const res = await verify({ audience: 'admin' });
    expect(res.statusCode).toBe(401);
    expect(m.prisma.admin.findUnique).not.toHaveBeenCalled();
  });
});

describe('refresh keeps the token type', () => {
  const refreshTokenFor = (type: string | undefined, sub: string) =>
    (app.jwt.sign as any)({ sub, tokenId: 'tok-1', ...(type ? { type } : {}) }, { expiresIn: '30d', key: config.JWT_REFRESH_SECRET }) as string;
  const refresh = (token: string) => app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: token } });

  beforeEach(() => {
    m.prisma.admin.findUniqueOrThrow.mockResolvedValue(ADMIN);
    m.prisma.operator.findUniqueOrThrow.mockResolvedValue(OPERATOR);
    m.prisma.user.findUniqueOrThrow.mockResolvedValue(USER);
  });

  it.each([
    ['admin', 'admin-1', 'admin'],
    ['operator', 'op-1', 'operator'],
    ['user', 'user-1', 'user'],
    [undefined, 'user-1', 'user'], // tokens without a type were always customer tokens
  ] as const)('type=%s stays %s', async (type, sub, expected) => {
    const res = await refresh(refreshTokenFor(type, sub));
    expect(res.statusCode).toBe(200);
    expect(m.redis.del).toHaveBeenCalledWith(`refresh:${sub}:tok-1`);
    expect(decode(res.json().accessToken)).toMatchObject({ sub, type: expected });
    expect(decodeRefresh(res.json().refreshToken)).toMatchObject({ sub, type: expected });
  });

  it.each([
    ['admin', 'admin-1', 'ADMIN_INACTIVE'],
    ['operator', 'op-1', 'OPERATOR_INACTIVE'],
  ] as const)('refuses a deactivated %s', async (type, sub, code) => {
    m.prisma.admin.findUniqueOrThrow.mockResolvedValue({ ...ADMIN, active: false });
    m.prisma.operator.findUniqueOrThrow.mockResolvedValue(INACTIVE_OPERATOR);
    const res = await refresh(refreshTokenFor(type, sub));
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe(code);
    expect(m.redis.setex).not.toHaveBeenCalled();
  });
});
