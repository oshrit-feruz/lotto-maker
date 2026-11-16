import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.js';
import { redis } from '../redis.js';
import { AppError } from './error-handler.js';
import {
  consumeRule,
  matchRule,
  redisCounterStore,
  type CounterStore,
  type LimitIdentity,
} from '../lib/route-limits.js';

/**
 * Two layers, both stored in Redis so the limits hold across API replicas:
 *
 * 1. @fastify/rate-limit: a global per-IP limit on every route (RATE_LIMIT_GLOBAL_PER_MINUTE).
 *    /health and /ready are exempt; the payment webhook gets a higher ceiling (provider retries).
 * 2. Route rules (src/lib/route-limits.ts): OTP send / verify, refresh, checkout, withdrawals,
 *    orders, KYC and admin, each per IP and per signed-in user (and per phone for OTP verify).
 *
 * If Redis is down both layers let requests through (logged): an outage of the limiter should not
 * become an outage of the API. The OTP module keeps its own per-phone limit either way.
 */
export default fp(async function rateLimitPlugin(
  app: FastifyInstance,
  opts: { store?: CounterStore } = {},
) {
  // Must be added before @fastify/rate-limit registers its own onRoute hook, which reads this config
  app.addHook('onRoute', (route) => {
    if (route.url === '/payments/webhook') {
      route.config = { ...(route.config as object), rateLimit: { max: 600, timeWindow: '1 minute' } } as typeof route.config;
    }
  });

  await app.register(import('@fastify/rate-limit'), {
    global: true,
    max: config.RATE_LIMIT_GLOBAL_PER_MINUTE,
    timeWindow: '1 minute',
    redis,
    nameSpace: 'rl:global:',
    skipOnError: true,
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, ctx) =>
      new AppError((ctx as { statusCode?: number }).statusCode ?? 429, 'RATE_LIMITED', 'Too many requests', { retryAfter: Math.ceil(ctx.ttl / 1000) }),
  });

  const store = opts.store ?? redisCounterStore(redis);

  // preHandler: the body is parsed (OTP verify keys on the phone) and runs before route preHandlers
  app.addHook('preHandler', async (request, reply) => {
    const rule = matchRule(request.method, request.routeOptions.url);
    if (!rule) return;

    let decision;
    try {
      decision = await consumeRule(store, rule, identify(app, request));
    } catch (err) {
      request.log.warn({ err, rule: rule.name }, 'route rate limit unavailable, allowing request');
      return;
    }
    if (decision.limited) {
      request.log.warn({ rule: rule.name, bucket: decision.bucket }, 'route rate limit hit');
      return reply
        .status(429)
        .header('retry-after', String(decision.retryAfterSec))
        .send({ error: 'RATE_LIMITED', message: 'Too many requests', retryAfter: decision.retryAfterSec });
    }
  });
});

/** IP always; the user only from a token that verifies (an unverified `sub` could be forged). */
function identify(app: FastifyInstance, request: FastifyRequest): LimitIdentity {
  const who: LimitIdentity = { ip: request.ip };
  const auth = request.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = app.jwt.verify<{ sub?: string; type?: string }>(auth.slice(7));
      if (payload.sub) who.userId = `${payload.type ?? 'user'}:${payload.sub}`;
    } catch {
      // invalid token: the route's own auth answers 401
    }
  }
  const phone = (request.body as { phone?: unknown } | undefined)?.phone;
  if (typeof phone === 'string' && phone.length <= 32) who.phone = phone;
  return who;
}
