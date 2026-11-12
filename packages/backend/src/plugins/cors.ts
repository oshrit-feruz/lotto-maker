import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.js';

/**
 * Strict CORS from ALLOWED_ORIGINS (exact origins, no wildcards). Requests without an Origin header
 * (mobile app, server-to-server webhooks, curl) are not browser cross-origin calls and pass.
 * A disallowed origin gets no CORS headers, so the browser blocks the response.
 */
export function isAllowedOrigin(origin: string | undefined, allowed: readonly string[] = config.ALLOWED_ORIGINS): boolean {
  return !origin || allowed.includes(origin);
}

export default fp(async function corsPlugin(app: FastifyInstance) {
  await app.register(import('@fastify/cors'), {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id'],
    exposedHeaders: ['x-request-id', 'retry-after'],
    maxAge: 600,
  });
});
