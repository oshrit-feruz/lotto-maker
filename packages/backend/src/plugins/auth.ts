import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.js';
import { AppError } from './error-handler.js';

export interface JwtPayload {
  sub: string;
  phone?: string;
  type: 'user' | 'operator';
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
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  await app.register(import('@fastify/jwt'), {
    secret: config.JWT_SECRET,
  });

  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
      if (request.user.type !== 'user') {
        throw new AppError(403, 'FORBIDDEN');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(401, 'UNAUTHORIZED');
    }
  });

  app.decorate('authenticateOperator', async (request: FastifyRequest) => {
    try {
      // EventSource can't set headers — allow token via query param for SSE
      const query = request.query as Record<string, string>;
      if (query?.token && !request.headers.authorization) {
        request.headers['authorization'] = `Bearer ${query.token}`;
      }
      await request.jwtVerify();
      if (request.user.type !== 'operator') {
        throw new AppError(403, 'FORBIDDEN');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(401, 'UNAUTHORIZED');
    }
  });
});
