import { describe, it, expect, vi, afterEach } from 'vitest';
import Fastify from 'fastify';
import { checkReadiness, withTimeout, TimeoutError } from '../../src/lib/readiness.js';
import healthPlugin from '../../src/plugins/health.js';

describe('checkReadiness', () => {
  afterEach(() => vi.useRealTimers());

  it('is ready when every probe answers', async () => {
    const report = await checkReadiness({ database: async () => 1, redis: async () => 'PONG' }, 100);
    expect(report.status).toBe('ready');
    expect(report.checks.database!.ok).toBe(true);
    expect(report.checks.redis!.ok).toBe(true);
  });

  it('is not ready when a probe throws, without leaking the error text', async () => {
    const report = await checkReadiness(
      {
        database: async () => {
          throw new Error('connect ECONNREFUSED postgresql://user:hunter2@db:5432/lotto');
        },
        redis: async () => 'PONG',
      },
      100,
    );
    expect(report.status).toBe('not_ready');
    expect(report.checks.database).toMatchObject({ ok: false, error: 'unavailable' });
    expect(JSON.stringify(report)).not.toContain('hunter2');
    expect(report.checks.redis!.ok).toBe(true);
  });

  it('times out a probe that hangs, and runs probes in parallel', async () => {
    vi.useFakeTimers();
    const pending = checkReadiness(
      { database: () => new Promise(() => {}), redis: () => new Promise(() => {}) },
      2000,
    );
    await vi.advanceTimersByTimeAsync(2000);
    const report = await pending;
    expect(report.status).toBe('not_ready');
    expect(report.checks.database!.error).toBe('timed out after 2000ms');
    expect(report.checks.redis!.error).toBe('timed out after 2000ms');
  });

  it('withTimeout passes the value through and rejects with TimeoutError when late', async () => {
    await expect(withTimeout(Promise.resolve(7), 10)).resolves.toBe(7);
    await expect(withTimeout(new Promise(() => {}), 5)).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('/health and /ready', () => {
  async function app(probes: Parameters<typeof checkReadiness>[0]) {
    const a = Fastify();
    await a.register(healthPlugin, { probes });
    return a;
  }

  it('/health answers 200 without touching dependencies', async () => {
    const probe = vi.fn(async () => 1);
    const a = await app({ database: probe });
    const res = await a.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('/ready answers 200 when ready and 503 when a dependency is down', async () => {
    const up = await app({ database: async () => 1, redis: async () => 'PONG' });
    expect((await up.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200);

    const down = await app({ database: async () => 1, redis: async () => { throw new Error('down'); } });
    const res = await down.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json().checks.redis.ok).toBe(false);
  });
});
