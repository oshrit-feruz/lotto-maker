import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

/**
 * A per-job Redis lock, so a scheduled job runs on one instance at a time even when several
 * instances (API replicas, a worker, a deploy overlap) all fire the same node-cron tick.
 *
 * - Acquire: SET key token NX PX ttl. Only the instance that sets it runs the job.
 * - While the job runs the lock is renewed every ttl/3, so a long run keeps it, and a crashed
 *   instance's lock expires after at most `ttlMs`.
 * - On release the lock is held on for at least `minHoldMs` from the start of the run. Instances
 *   whose clocks are a few seconds apart fire the "same" tick at slightly different times; without
 *   the hold, a fast job would finish and release before the late instance tries, and run twice.
 *
 * If Redis cannot be reached the job is skipped, not run unlocked: every job here moves money or
 * sends messages, and a skipped tick is simply picked up by the next one.
 */

export interface LockStore {
  acquire(key: string, token: string, ttlMs: number): Promise<boolean>;
  extend(key: string, token: string, ttlMs: number): Promise<boolean>;
  /** Deletes the lock if `token` still owns it, or shortens it to `holdMs` when that is > 0. */
  release(key: string, token: string, holdMs: number): Promise<void>;
}

const EXTEND = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0`;

const RELEASE = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  local hold = tonumber(ARGV[2])
  if hold > 0 then
    return redis.call('pexpire', KEYS[1], hold)
  end
  return redis.call('del', KEYS[1])
end
return 0`;

export function redisLockStore(redis: Redis): LockStore {
  return {
    async acquire(key, token, ttlMs) {
      return (await redis.set(key, token, 'PX', ttlMs, 'NX')) === 'OK';
    },
    async extend(key, token, ttlMs) {
      return Number(await redis.eval(EXTEND, 1, key, token, String(ttlMs))) === 1;
    },
    async release(key, token, holdMs) {
      await redis.eval(RELEASE, 1, key, token, String(Math.max(0, Math.ceil(holdMs))));
    },
  };
}

export type JobOutcome =
  | { status: 'ran'; durationMs: number; result: unknown }
  | { status: 'failed'; durationMs: number; error: unknown }
  | { status: 'skipped_locked'; durationMs: number }
  | { status: 'skipped_lock_unavailable'; durationMs: number; error: unknown };

export interface JobLockOptions {
  /** Lock lifetime without renewal. Renewed every ttlMs/3 while the job runs. */
  ttlMs?: number;
  /** Keep the lock at least this long after the run started (clock-skew guard). */
  minHoldMs?: number;
  now?: () => number;
}

export const LOCK_PREFIX = 'lock:job:';

export async function runWithJobLock(
  store: LockStore,
  name: string,
  fn: () => Promise<unknown>,
  { ttlMs = 60_000, minHoldMs = 30_000, now = Date.now }: JobLockOptions = {},
): Promise<JobOutcome> {
  const key = LOCK_PREFIX + name;
  const token = randomUUID();
  const started = now();

  let acquired: boolean;
  try {
    acquired = await store.acquire(key, token, ttlMs);
  } catch (error) {
    return { status: 'skipped_lock_unavailable', durationMs: now() - started, error };
  }
  if (!acquired) return { status: 'skipped_locked', durationMs: now() - started };

  const renew = setInterval(() => {
    store.extend(key, token, ttlMs).catch(() => {
      // Renewal is best effort; if the lock is lost the TTL still bounds overlap
    });
  }, Math.max(1000, Math.floor(ttlMs / 3)));
  renew.unref();

  try {
    const result = await fn();
    return { status: 'ran', durationMs: now() - started, result };
  } catch (error) {
    return { status: 'failed', durationMs: now() - started, error };
  } finally {
    clearInterval(renew);
    const hold = minHoldMs - (now() - started);
    await store.release(key, token, hold > 0 ? hold : 0).catch(() => {
      // An unreleased lock expires on its own after ttlMs
    });
  }
}
