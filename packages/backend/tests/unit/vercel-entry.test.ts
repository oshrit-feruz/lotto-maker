import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { applyVercelEnv, withPgBouncerFlag, VERCEL_DEFAULTS } from '../../src/lib/platform-env.js';
import cronRoutes, { hasCronSecret } from '../../src/cron/http.js';
import { JOBS, type JobDefinition } from '../../src/cron/index.js';
import type { JobOutcome } from '../../src/lib/job-lock.js';
import { stripServicePrefix } from '../../src/lib/service-prefix.js';

describe('applyVercelEnv', () => {
  it('takes REDIS_URL from the Upstash KV_URL when REDIS_URL is unset', () => {
    const env = applyVercelEnv({ KV_URL: 'rediss://default:t@x.upstash.io:6379' });
    expect(env.REDIS_URL).toBe('rediss://default:t@x.upstash.io:6379');
    expect(applyVercelEnv({ KV_URL: 'rediss://a', REDIS_URL: 'redis://b' }).REDIS_URL).toBe('redis://b');
  });

  it('fills the Vercel defaults without overriding set values', () => {
    expect(applyVercelEnv({})).toMatchObject(VERCEL_DEFAULTS);
    expect(applyVercelEnv({ RUN_JOBS: 'true', TRUST_PROXY_HOPS: '2' })).toMatchObject({ RUN_JOBS: 'true', TRUST_PROXY_HOPS: '2' });
  });

  it('takes NODE_ENV from BACKEND_NODE_ENV (project variables are shared by every service)', () => {
    expect(applyVercelEnv({ NODE_ENV: 'production', BACKEND_NODE_ENV: 'development' }).NODE_ENV).toBe('development');
    expect(applyVercelEnv({ NODE_ENV: 'production' }).NODE_ENV).toBe('production');
  });

  it('marks a Neon pooled URL for PgBouncer and leaves other URLs alone', () => {
    const pooled = 'postgresql://u:p@ep-x-123-pooler.eu-central-1.aws.neon.tech/db?sslmode=require';
    expect(applyVercelEnv({ DATABASE_URL: pooled }).DATABASE_URL).toBe(`${pooled}&pgbouncer=true`);
    const direct = 'postgresql://u:p@ep-x-123.eu-central-1.aws.neon.tech/db?sslmode=require';
    expect(withPgBouncerFlag(direct)).toBe(direct);
    expect(withPgBouncerFlag(`${pooled}&pgbouncer=false`)).toBe(`${pooled}&pgbouncer=false`);
    expect(withPgBouncerFlag('not a url')).toBe('not a url');
  });
});

describe('GET /cron/:job', () => {
  const SECRET = 'cron-secret-0123456789';
  const job: JobDefinition = { name: 'demo', schedule: '* * * * *', run: async () => 'ok' };

  async function appWith(secret: string, ...outcomes: JobOutcome[]) {
    // Each call returns the next outcome; the last one repeats
    const list: JobOutcome[] = outcomes.length > 0 ? outcomes : [{ status: 'ran', durationMs: 5, result: 'ok' }];
    let calls = 0;
    const run = vi.fn(async () => list[Math.min(calls++, list.length - 1)]!);
    const app = Fastify();
    await app.register(cronRoutes, { jobs: [job], secret, run, retryDelaysMs: [1, 1] });
    return { app, run };
  }
  const auth = (s: string) => ({ authorization: `Bearer ${s}` });

  it('runs the job with the right secret', async () => {
    const { app, run } = await appWith(SECRET);
    const res = await app.inject({ method: 'GET', url: '/cron/demo', headers: auth(SECRET) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ job: 'demo', outcome: 'ran', durationMs: 5 });
    expect(run).toHaveBeenCalledWith(job);
  });

  it('refuses a missing or wrong secret without running anything', async () => {
    const { app, run } = await appWith(SECRET);
    expect((await app.inject({ method: 'GET', url: '/cron/demo' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/cron/demo', headers: auth('wrong') })).statusCode).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('is off (404) without CRON_SECRET, and 404s an unknown job', async () => {
    const off = await appWith('');
    expect((await off.app.inject({ method: 'GET', url: '/cron/demo', headers: auth(SECRET) })).statusCode).toBe(404);
    const on = await appWith(SECRET);
    expect((await on.app.inject({ method: 'GET', url: '/cron/nope', headers: auth(SECRET) })).statusCode).toBe(404);
  });

  it('reports a failed run as 500 so the platform logs it', async () => {
    const { app, run } = await appWith(SECRET, { status: 'failed', durationMs: 1, error: new Error('x') });
    expect((await app.inject({ method: 'GET', url: '/cron/demo', headers: auth(SECRET) })).statusCode).toBe(500);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries while the lock store is unreachable, then reports the final outcome', async () => {
    const down: JobOutcome = { status: 'skipped_lock_unavailable', durationMs: 1, error: new Error('redis') };
    const recovers = await appWith(SECRET, down, { status: 'ran', durationMs: 2, result: 'ok' });
    expect((await recovers.app.inject({ method: 'GET', url: '/cron/demo', headers: auth(SECRET) })).statusCode).toBe(200);
    expect(recovers.run).toHaveBeenCalledTimes(2);

    const stays = await appWith(SECRET, down);
    expect((await stays.app.inject({ method: 'GET', url: '/cron/demo', headers: auth(SECRET) })).statusCode).toBe(503);
    expect(stays.run).toHaveBeenCalledTimes(3);

    const locked = await appWith(SECRET, { status: 'skipped_locked', durationMs: 0 });
    expect((await locked.app.inject({ method: 'GET', url: '/cron/demo', headers: auth(SECRET) })).statusCode).toBe(200);
    expect(locked.run).toHaveBeenCalledTimes(1);
  });

  it('compares the header exactly', () => {
    expect(hasCronSecret(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(hasCronSecret(SECRET, SECRET)).toBe(false);
    expect(hasCronSecret(undefined, SECRET)).toBe(false);
  });
});

describe('stripServicePrefix', () => {
  it('removes a leading /backend segment', () => {
    expect(stripServicePrefix('/backend/health')).toBe('/health');
    expect(stripServicePrefix('/backend/cron/settlement')).toBe('/cron/settlement');
    expect(stripServicePrefix('/backend/payments/return?paymentId=1')).toBe('/payments/return?paymentId=1');
    expect(stripServicePrefix('/backend')).toBe('/');
    expect(stripServicePrefix('/backend/')).toBe('/');
    expect(stripServicePrefix('/backend?x=1')).toBe('/?x=1');
  });

  it('leaves other paths alone (binding calls arrive without the prefix)', () => {
    expect(stripServicePrefix('/health')).toBe('/health');
    expect(stripServicePrefix('/backendfoo')).toBe('/backendfoo');
    expect(stripServicePrefix('/auth/backend/x')).toBe('/auth/backend/x');
    expect(stripServicePrefix('/')).toBe('/');
    expect(stripServicePrefix(undefined)).toBeUndefined();
  });
});

describe('root vercel.json', () => {
  const vercel = JSON.parse(readFileSync(new URL('../../../../vercel.json', import.meta.url), 'utf8')) as {
    crons?: { path: string; schedule: string }[];
    rewrites: { source: string; destination: { service: string } }[];
    services: Record<string, { installCommand?: string }>;
  };

  it('installs once for all services (a per-service npm ci wipes what earlier services built)', () => {
    const commands = Object.values(vercel.services).map((s) => s.installCommand);
    expect(new Set(commands)).toEqual(new Set(['sh ../../scripts/vercel-install.sh']));
  });

  it('defines no Vercel crons (Hobby plan); the staging-cron workflow triggers every job', () => {
    expect(vercel.crons).toBeUndefined();
    const workflow = readFileSync(
      new URL('../../../../.github/workflows/staging-cron.yml', import.meta.url),
      'utf8',
    );
    const scheduled = [...workflow.matchAll(/JOBS="([^"$]+)"/g)].flatMap((m) => m[1].split(' ')).sort();
    expect(scheduled).toEqual(JOBS.map((j) => j.name).sort());
  });

  it('routes the backend prefix to the backend service before the catch-all', () => {
    expect(vercel.rewrites[0]).toEqual({ source: '/backend/(.*)', destination: { service: 'backend' } });
    expect(vercel.rewrites.at(-1)).toEqual({ source: '/(.*)', destination: { service: 'web' } });
  });
});
