import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.js';
import { AppError } from './error-handler.js';

export interface JwtPayload {
  sub: string;
  phone?: string;
  type: 'user' | 'operator' | 'admin';
}

// Augment @fastify/jwt to use our payload type
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
    authenticateOperator: (request: FastifyRequest) => Promise<void>;
    authenticateAdmin: (request: FastifyRequest) => Promise<void>;
  }
}

/**
 * Refresh tokens carry a tokenId and are never accepted as access tokens. Until this check, refresh
 * tokens were signed with JWT_SECRET (the `secret` sign option is ignored by @fastify/jwt), so a
 * refresh token issued before the fix would otherwise still pass jwtVerify for up to 30 days.
 */
function assertAccessToken(request: FastifyRequest): void {
  if ('tokenId' in (request.user as object)) throw new AppError(401, 'UNAUTHORIZED');
}

export default fp(async function authPlugin(app: FastifyInstance) {
  await app.register(import('@fastify/jwt'), {
    secret: config.JWT_SECRET,
  });

  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
      assertAccessToken(request);
      if (request.user.type !== 'user') {
        throw new AppError(403, 'FORBIDDEN');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(401, 'UNAUTHORIZED');
    }
  });

  // Admins are a separate role from operators: an operator token never passes here
  app.decorate('authenticateAdmin', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
      assertAccessToken(request);
      if (request.user.type !== 'admin') {
        throw new AppError(403, 'FORBIDDEN');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(401, 'UNAUTHORIZED');
    }
  });

  app.decorate('authenticateOperator',async (request: FastifyRequest) => {
    try {
      // EventSource can't set headers — allow token via query param for SSE
      const query = request.query as Record<string, string>;
      if (query?.token && !request.headers.authorization) {
        request.headers['authorization'] = `Bearer ${query.token}`; // NOSONAR: EventSource API has no header support; token is short-lived operator JWT
      }
      await request.jwtVerify();
      assertAccessToken(request);
      if (request.user.type !== 'operator') {
        throw new AppError(403, 'FORBIDDEN');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(401, 'UNAUTHORIZED');
    }
  });
});
