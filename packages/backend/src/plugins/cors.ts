import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.js';

export default fp(async function corsPlugin(app: FastifyInstance) {
  await app.register(import('@fastify/cors'), {
    origin: config.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });
});
