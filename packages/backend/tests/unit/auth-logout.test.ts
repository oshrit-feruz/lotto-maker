import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

/* eslint-disable @typescript-eslint/no-explicit-any */

const redisDel = vi.hoisted(() => vi.fn());
vi.mock('../../src/redis.js', () => ({ redis: { del: redisDel, setex: vi.fn(), get: vi.fn() } }));
vi.mock('../../src/prisma.js', () => ({ prisma: {} }));

import { config } from '../../src/config.js';
import errorHandler from '../../src/plugins/error-handler.js';
import authPlugin from '../../src/plugins/auth.js';
import authRoutes from '../../src/modules/auth/auth.routes.js';

let app: FastifyInstance;

const refreshTokenFor = (type: 'user' | 'operator' | 'admin', sub = `${type}-1`, tokenId = 'tok-1') =>
  (app.jwt.sign as any)({ sub, tokenId, type }, { expiresIn: '30d', key: config.JWT_REFRESH_SECRET }) as string;

beforeEach(async () => {
  vi.clearAllMocks();
  redisDel.mockResolvedValue(1);
  app = Fastify();
  await app.register(errorHandler);
  await app.register(authPlugin);
  await app.register(authRoutes);
  app.get('/whoami', { preHandler: [app.authenticate] }, async (request) => ({ sub: request.user.sub }));
  await app.ready();
});
afterEach(() => app.close());

describe('logout', () => {
  it.each(['user', 'operator', 'admin'] as const)('revokes a %s refresh token without an access token', async (type) => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/auth/logout',
      payload: { refreshToken: refreshTokenFor(type, `${type}-7`, 'abc') },
    });
    expect(res.statusCode).toBe(204);
    expect(redisDel).toHaveBeenCalledWith(`refresh:${type}-7:abc`);
  });

  it('works for an admin even when an admin access token is sent (used to be 403)', async () => {
    const access = app.jwt.sign({ sub: 'admin-1', phone: '+972500000000', type: 'admin' });
    const res = await app.inject({
      method: 'DELETE',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${access}` },
      payload: { refreshToken: refreshTokenFor('admin') },
    });
    expect(res.statusCode).toBe(204);
    expect(redisDel).toHaveBeenCalledWith('refresh:admin-1:tok-1');
  });

  it('also accepts POST', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken: refreshTokenFor('user') } });
    expect(res.statusCode).toBe(204);
    expect(redisDel).toHaveBeenCalledWith('refresh:user-1:tok-1');
  });

  it('does nothing for a token not signed with the refresh secret (e.g. an access token)', async () => {
    const access = app.jwt.sign({ sub: 'user-1', tokenId: 'tok-1', type: 'user' } as any);
    const res = await app.inject({ method: 'DELETE', url: '/auth/logout', payload: { refreshToken: access } });
    expect(res.statusCode).toBe(204);
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('rejects a missing refresh token with 400', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/auth/logout', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(redisDel).not.toHaveBeenCalled();
  });
});

describe('refresh tokens', () => {
  it('are signed with JWT_REFRESH_SECRET, not the access-token secret', () => {
    const refresh = refreshTokenFor('user');
    expect(() => app.jwt.verify(refresh)).toThrow();
    expect((app.jwt.verify as any)(refresh, { key: config.JWT_REFRESH_SECRET })).toMatchObject({ sub: 'user-1', tokenId: 'tok-1' });
  });

  it('are never accepted as access tokens, even one signed with the access secret (issued before the fix)', async () => {
    const legacyRefresh = app.jwt.sign({ sub: 'user-1', tokenId: 'tok-1', type: 'user' } as any, { expiresIn: '30d' });
    const res = await app.inject({ method: 'GET', url: '/whoami', headers: { authorization: `Bearer ${legacyRefresh}` } });
    expect(res.statusCode).toBe(401);

    const access = app.jwt.sign({ sub: 'user-1', type: 'user' });
    const ok = await app.inject({ method: 'GET', url: '/whoami', headers: { authorization: `Bearer ${access}` } });
    expect(ok.json()).toEqual({ sub: 'user-1' });
  });
});
