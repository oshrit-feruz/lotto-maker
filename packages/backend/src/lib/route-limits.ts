import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';

/**
 * Stricter limits for the sensitive routes, on top of the global per-IP limit of
 * @fastify/rate-limit. Each rule can count per IP, per signed-in user and per phone number
 * (OTP routes), and a request must stay under every bucket that applies to it.
 *
 * The rules live here, keyed by route pattern, so the business modules stay untouched.
 */

export type BucketKind = 'ip' | 'user' | 'phone';

export interface Bucket {
  by: BucketKind;
  max: number;
  windowMs: number;
}

export interface RouteLimitRule {
  name: string;
  methods: readonly string[];
  /** Exact Fastify route pattern, or a prefix ending in `*`. */
  url: string;
  buckets: readonly Bucket[];
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export const ROUTE_LIMIT_RULES: readonly RouteLimitRule[] = [
  // OTP send: the module already allows 3 per phone per 10 min; this caps one IP spraying numbers.
  {
    name: 'otp-send',
    methods: ['POST'],
    url: '/auth/send-otp',
    buckets: [
      { by: 'ip', max: 10, windowMs: 15 * MIN },
      { by: 'ip', max: 30, windowMs: 24 * HOUR },
    ],
  },
  // OTP verify (login): the module locks a code after 5 tries; this caps guessing across codes.
  {
    name: 'otp-verify',
    methods: ['POST'],
    url: '/auth/verify-otp',
    buckets: [
      { by: 'ip', max: 20, windowMs: 15 * MIN },
      { by: 'phone', max: 10, windowMs: 15 * MIN },
    ],
  },
  { name: 'token-refresh', methods: ['POST'], url: '/auth/refresh', buckets: [{ by: 'ip', max: 60, windowMs: 15 * MIN }] },
  {
    name: 'checkout',
    methods: ['POST'],
    url: '/payments/checkout',
    buckets: [
      { by: 'user', max: 10, windowMs: 10 * MIN },
      { by: 'ip', max: 30, windowMs: 10 * MIN },
    ],
  },
  {
    name: 'withdrawals',
    methods: ['POST'],
    url: '/wallet/withdrawals*',
    buckets: [
      { by: 'user', max: 10, windowMs: HOUR },
      { by: 'ip', max: 30, windowMs: HOUR },
    ],
  },
  {
    name: 'orders',
    methods: ['POST'],
    url: '/orders',
    buckets: [
      { by: 'user', max: 30, windowMs: MIN },
      { by: 'ip', max: 60, windowMs: MIN },
    ],
  },
  // KYC calls a paid provider
  { name: 'kyc', methods: ['POST'], url: '/me/kyc', buckets: [{ by: 'user', max: 10, windowMs: HOUR }] },
  // Admin: reads are frequent (dashboards), changes much less so
  {
    name: 'admin-write',
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/admin/*',
    buckets: [
      { by: 'user', max: 60, windowMs: MIN },
      { by: 'ip', max: 120, windowMs: MIN },
    ],
  },
  {
    name: 'admin-read',
    methods: ['GET'],
    url: '/admin/*',
    buckets: [
      { by: 'user', max: 300, windowMs: MIN },
      { by: 'ip', max: 600, windowMs: MIN },
    ],
  },
];

export function matchRule(
  method: string,
  routeUrl: string | undefined,
  rules: readonly RouteLimitRule[] = ROUTE_LIMIT_RULES,
): RouteLimitRule | undefined {
  if (!routeUrl) return undefined;
  return rules.find(
    (r) =>
      r.methods.includes(method) &&
      (r.url.endsWith('*') ? routeUrl.startsWith(r.url.slice(0, -1)) : routeUrl === r.url),
  );
}

export interface LimitIdentity {
  ip: string;
  userId?: string;
  phone?: string;
}

export interface CounterStore {
  /** Adds one hit to `key` and returns the count in the current window and ms until it resets. */
  hit(key: string, windowMs: number): Promise<{ count: number; resetMs: number }>;
}

const HIT = `
local count = redis.call('incr', KEYS[1])
if count == 1 then redis.call('pexpire', KEYS[1], ARGV[1]) end
local ttl = redis.call('pttl', KEYS[1])
if ttl < 0 then redis.call('pexpire', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}`;

export function redisCounterStore(redis: Redis): CounterStore {
  return {
    async hit(key, windowMs) {
      const [count, ttl] = (await redis.eval(HIT, 1, key, String(windowMs))) as [number, number];
      return { count: Number(count), resetMs: Number(ttl) };
    },
  };
}

// Phone numbers are personal data: the Redis key holds a hash, never the number.
const digest = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 24);

export type LimitDecision = { limited: false } | { limited: true; retryAfterSec: number; bucket: BucketKind };

/** Counts the request against every applicable bucket of `rule`; limited if any is over. */
export async function consumeRule(
  store: CounterStore,
  rule: RouteLimitRule,
  who: LimitIdentity,
): Promise<LimitDecision> {
  let worst: LimitDecision = { limited: false };
  for (const b of rule.buckets) {
    const id = b.by === 'ip' ? who.ip : b.by === 'user' ? who.userId : who.phone;
    if (!id) continue; // e.g. a per-user bucket on a request without a valid token
    const key = `rl:${rule.name}:${b.by}:${b.windowMs}:${b.by === 'ip' ? id : digest(id)}`;
    const { count, resetMs } = await store.hit(key, b.windowMs);
    if (count > b.max) {
      const retryAfterSec = Math.max(1, Math.ceil(resetMs / 1000));
      if (!worst.limited || retryAfterSec > worst.retryAfterSec) worst = { limited: true, retryAfterSec, bucket: b.by };
    }
  }
  return worst;
}
