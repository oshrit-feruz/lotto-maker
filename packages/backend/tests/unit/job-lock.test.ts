import { describe, it, expect, afterAll } from 'vitest';
import { Redis } from 'ioredis';
import { runWithJobLock, redisLockStore, LOCK_PREFIX, type LockStore } from '../../src/lib/job-lock.js';

/** In-memory LockStore with the same semantics as the Redis one, on a controllable clock. */
function memoryStore(clock: { now: number }) {
  const locks = new Map<string, { token: string; expiresAt: number }>();
  const live = (key: string) => {
    const l = locks.get(key);
    if (l && l.expiresAt <= clock.now) locks.delete(key);
    return locks.get(key);
  };
  const store: LockStore = {
    async acquire(key, token, ttlMs) {
      if (live(key)) return false;
      locks.set(key, { token, expiresAt: clock.now + ttlMs });
      return true;
    },
    async extend(key, token, ttlMs) {
      const l = live(key);
      if (l?.token !== token) return false;
      l.expiresAt = clock.now + ttlMs;
      return true;
    },
    async release(key, token, holdMs) {
      const l = live(key);
      if (l?.token !== token) return;
      if (holdMs > 0) l.expiresAt = clock.now + holdMs;
      else locks.delete(key);
    },
  };
  return { store, locks, live };
}

describe('runWithJobLock', () => {
  it('runs the job and reports its result and duration', async () => {
    const clock = { now: 1_000 };
    const { store } = memoryStore(clock);
    const outcome = await runWithJobLock(
      store,
      'j',
      async () => {
        clock.now += 250;
        return { settled: 2 };
      },
      { now: () => clock.now, minHoldMs: 0 },
    );
    expect(outcome).toEqual({ status: 'ran', durationMs: 250, result: { settled: 2 } });
  });

  it('lets only one of two concurrent runs execute', async () => {
    const clock = { now: 0 };
    const { store } = memoryStore(clock);
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const job = async () => {
      calls++;
      await gate;
    };
    const first = runWithJobLock(store, 'settlement', job, { now: () => clock.now });
    const second = await runWithJobLock(store, 'settlement', job, { now: () => clock.now });
    release();
    expect((await first).status).toBe('ran');
    expect(second.status).toBe('skipped_locked');
    expect(calls).toBe(1);
  });

  it('holds the lock for minHoldMs after a fast run (clock-skew guard), then frees it', async () => {
    const clock = { now: 0 };
    const { store, live } = memoryStore(clock);
    const opts = { now: () => clock.now, minHoldMs: 30_000 };
    expect((await runWithJobLock(store, 'receipts', async () => {}, opts)).status).toBe('ran');

    clock.now = 5_000; // a second instance whose tick fires 5 s late
    expect((await runWithJobLock(store, 'receipts', async () => {}, opts)).status).toBe('skipped_locked');

    clock.now = 30_001;
    expect(live(LOCK_PREFIX + 'receipts')).toBeUndefined();
    expect((await runWithJobLock(store, 'receipts', async () => {}, opts)).status).toBe('ran');
  });

  it('releases at once when the run already lasted longer than minHoldMs', async () => {
    const clock = { now: 0 };
    const { store, live } = memoryStore(clock);
    await runWithJobLock(store, 'slow', async () => void (clock.now += 45_000), { now: () => clock.now, minHoldMs: 30_000 });
    expect(live(LOCK_PREFIX + 'slow')).toBeUndefined();
  });

  it('reports a throwing job as failed and still releases the lock', async () => {
    const clock = { now: 0 };
    const { store, live } = memoryStore(clock);
    const boom = new Error('boom');
    const outcome = await runWithJobLock(store, 'bad', async () => { throw boom; }, { now: () => clock.now, minHoldMs: 0 });
    expect(outcome).toMatchObject({ status: 'failed', error: boom });
    expect(live(LOCK_PREFIX + 'bad')).toBeUndefined();
  });

  it('skips (does not run unlocked) when the lock store is unavailable', async () => {
    let ran = false;
    const down: LockStore = {
      acquire: async () => { throw new Error('ECONNREFUSED'); },
      extend: async () => false,
      release: async () => {},
    };
    const outcome = await runWithJobLock(down, 'j', async () => { ran = true; });
    expect(outcome.status).toBe('skipped_lock_unavailable');
    expect(ran).toBe(false);
  });

  it('does not release a lock that another instance took over after expiry', async () => {
    const clock = { now: 0 };
    const { store, locks } = memoryStore(clock);
    await runWithJobLock(
      store,
      'long',
      async () => {
        // Our lock expires mid-run (no renewal in this fake clock) and another instance takes it
        clock.now += 70_000;
        expect(await store.acquire(LOCK_PREFIX + 'long', 'other', 60_000)).toBe(true);
      },
      { now: () => clock.now, ttlMs: 60_000, minHoldMs: 0 },
    );
    expect(locks.get(LOCK_PREFIX + 'long')?.token).toBe('other');
  });
});

// Runs against a real Redis when TEST_REDIS_URL is set (CI sets it; locally e.g. redis://localhost:6379).
const REDIS_URL = process.env.TEST_REDIS_URL;

describe.skipIf(!REDIS_URL)('redisLockStore (real Redis)', () => {
  const redis = new Redis(REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true, maxRetriesPerRequest: 1 });
  const store = redisLockStore(redis);
  const key = `${LOCK_PREFIX}test-${process.pid}-${Date.now()}`;

  afterAll(async () => {
    await redis.del(key);
    await redis.quit();
  });

  it('acquires once, refuses a second owner, extends and releases only for the owner', async () => {
    expect(await store.acquire(key, 'a', 10_000)).toBe(true);
    expect(await store.acquire(key, 'b', 10_000)).toBe(false);
    expect(await store.extend(key, 'b', 20_000)).toBe(false);
    expect(await store.extend(key, 'a', 20_000)).toBe(true);
    expect(await redis.pttl(key)).toBeGreaterThan(10_000);

    await store.release(key, 'b', 0);
    expect(await redis.get(key)).toBe('a');

    await store.release(key, 'a', 500);
    expect(await redis.pttl(key)).toBeLessThanOrEqual(500);

    await store.release(key, 'a', 0);
    expect(await redis.get(key)).toBeNull();
  });

  it('two concurrent runs on one Redis: exactly one executes', async () => {
    let calls = 0;
    const job = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 50));
    };
    const name = `concurrent-${process.pid}-${Date.now()}`;
    const outcomes = await Promise.all([1, 2, 3].map(() => runWithJobLock(store, name, job, { minHoldMs: 0 })));
    expect(outcomes.filter((o) => o.status === 'ran')).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === 'skipped_locked')).toHaveLength(2);
    expect(calls).toBe(1);
  });
});
