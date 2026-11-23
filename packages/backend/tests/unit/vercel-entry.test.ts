import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { applyVercelEnv, withPgBouncerFlag, VERCEL_DEFAULTS } from '../../src/lib/platform-env.js';
import cronRoutes, { hasCronSecret } from '../../src/cron/http.js';
import { JOBS, type JobDefinition } from '../../src/cron/index.js';
import type { JobOutcome } from '../../src/lib/job-lock.js';

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

  async function appWith(secret: string | undefined, outcome: JobOutcome = { status: 'ran', durationMs: 5, result: 'ok' }) {
    const run = vi.fn(async () => outcome);
    const app = Fastify();
    await app.register(cronRoutes, { jobs: [job], secret, run });
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
    const off = await appWith(undefined);
    expect((await off.app.inject({ method: 'GET', url: '/cron/demo', headers: auth(SECRET) })).statusCode).toBe(404);
    const on = await appWith(SECRET);
    expect((await on.app.inject({ method: 'GET', url: '/cron/nope', headers: auth(SECRET) })).statusCode).toBe(404);
  });

  it('reports a failed run as 500 so the platform logs it', async () => {
    const { app } = await appWith(SECRET, { status: 'failed', durationMs: 1, error: new Error('x') });
    expect((await app.inject({ method: 'GET', url: '/cron/demo', headers: auth(SECRET) })).statusCode).toBe(500);
  });

  it('compares the header exactly', () => {
    expect(hasCronSecret(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(hasCronSecret(SECRET, SECRET)).toBe(false);
    expect(hasCronSecret(undefined, SECRET)).toBe(false);
  });
});

describe('vercel.json crons', () => {
  it('has exactly one entry per job in src/cron/index.ts', () => {
    const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };
    const paths = vercel.crons.map((c) => c.path).sort();
    expect(paths).toEqual(JOBS.map((j) => `/cron/${j.name}`).sort());
  });
});
