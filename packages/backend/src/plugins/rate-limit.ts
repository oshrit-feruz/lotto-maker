import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { redis } from '../redis.js';

export default fp(async function rateLimitPlugin(app: FastifyInstance) {
  await app.register(import('@fastify/rate-limit'), {
    max: 100,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (request) =>
      request.ip,
  });
});
