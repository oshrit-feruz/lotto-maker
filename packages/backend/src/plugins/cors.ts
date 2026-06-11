import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.js';

const ALLOWED_ORIGINS: string[] = config.CORS_ORIGINS
  ? config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : config.NODE_ENV === 'development'
    ? ['http://localhost:3000', 'http://localhost:8081', 'http://localhost:19006']
    : [];

export default fp(async function corsPlugin(app: FastifyInstance) {
  await app.register(import('@fastify/cors'), {
    origin: ALLOWED_ORIGINS.length > 0
      ? (origin, cb) => {
          if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
          cb(new Error('CORS_ORIGIN_NOT_ALLOWED'), false);
        }
      : false,
    credentials: true,
  });
});
