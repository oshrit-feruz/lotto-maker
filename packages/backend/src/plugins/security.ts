import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.js';

/**
 * Security headers (@fastify/helmet). The API serves JSON, so production gets helmet's default CSP.
 * Outside production the CSP is off: the Swagger UI (/docs) and the mock hosted-checkout page use
 * inline scripts and styles.
 */
export default fp(async function securityPlugin(app: FastifyInstance) {
  await app.register(import('@fastify/helmet'), {
    global: true,
    contentSecurityPolicy: config.NODE_ENV === 'production' && !config.ENABLE_API_DOCS ? undefined : false,
    // The web app and dashboards are on other origins and read responses through CORS
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // Every response carries the request id, so a user-reported error can be found in the logs
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
});
