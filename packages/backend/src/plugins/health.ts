import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { redis } from '../redis.js';
import { checkReadiness, type Probe } from '../lib/readiness.js';

/**
 * GET /health  liveness: the process is up and its event loop answers. No dependency checks, so a
 *              database blip does not get every instance restarted at once.
 * GET /ready   readiness: Postgres and Redis answer within READY_CHECK_TIMEOUT_MS. 503 otherwise.
 */
export default fp(async function healthPlugin(
  app: FastifyInstance,
  opts: { probes?: Record<string, Probe> } = {},
) {
  const probes: Record<string, Probe> = opts.probes ?? {
    database: () => prisma.$queryRaw`SELECT 1`,
    redis: () => redis.ping(),
  };
  const routeOpts = { config: { rateLimit: false }, schema: { hide: true } } as const;

  app.get('/health', routeOpts, async () => ({ status: 'ok' }));

  app.get('/ready', routeOpts, async (_request, reply) => {
    const report = await checkReadiness(probes, config.READY_CHECK_TIMEOUT_MS);
    return reply.status(report.status === 'ready' ? 200 : 503).send(report);
  });
});
