import cron, { type ScheduledTask } from 'node-cron';
import { TIMEZONE } from '@lotto-maker/shared';
import { redis } from '../redis.js';
import { logger } from '../lib/logger.js';
import { reportError } from '../lib/report-error.js';
import { redisLockStore, runWithJobLock, type JobOutcome, type LockStore } from '../lib/job-lock.js';

import { settleConfirmedDraws } from '../modules/results/settlement.service.js';
import { syncUpcomingDraws, fetchDueResults } from '../modules/draws/draws.sync.js';
import { runSubscriptionCron } from '../services/subscription-scheduler.js';
import { runCardCreditJob } from '../modules/wallet/card-credits.service.js';
import { runPrizeClaimJob } from '../modules/prize-claims/prize-claims.service.js';
import { issueMissingReceipts } from '../modules/receipts/receipts.service.js';

/**
 * Every recurring job, in one table. Phase 7 moved the schedules here from the modules'
 * start*Scheduler functions (which are no longer called), so each run can be wrapped in:
 *
 * - a Redis lock (src/lib/job-lock.ts): with several instances, one of them runs a given tick;
 * - one structured log line per run: job, outcome, duration and the job's own result.
 *
 * Why a lock and not BullMQ repeatable jobs: the lock is a small change around the existing
 * node-cron schedules and job functions, adds no queue, worker or Redis connection, and keeps
 * the timezone handling as it was. The job bodies are already idempotent on their own (guarded
 * updates, unique constraints, `reminderSentAt` / SubscriptionEvent claims), so the lock is the
 * outer guard against two instances doing the same work at the same time, not the only one.
 *
 * Which process runs them: RUN_JOBS (see config.ts). Production runs one worker with RUN_JOBS=true
 * and the API replicas with RUN_JOBS=false.
 */

export interface JobDefinition {
  name: string;
  /** node-cron expression */
  schedule: string;
  timezone?: string;
  run: () => Promise<unknown>;
  /** Also run once when the scheduler starts. */
  runOnStart?: boolean;
  /** Lock lifetime without renewal (renewed while running). */
  lockTtlMs?: number;
}

export const JOBS: readonly JobDefinition[] = [
  // Settle draws whose results an admin confirmed
  { name: 'settlement', schedule: '* * * * *', run: settleConfirmedDraws },
  // Issue missing fee receipts and the credit receipts of refunded orders
  { name: 'receipts', schedule: '* * * * *', run: issueMissingReceipts },
  // Pay due card credits (prize excess) and retry card withdrawals left unpaid
  { name: 'card-credits', schedule: '*/5 * * * *', run: runCardCreditJob },
  // Next draw and cutoff, including announced Thursday draws
  { name: 'draws-sync', schedule: '*/30 * * * *', timezone: TIMEZONE, run: syncUpcomingDraws, runOnStart: true },
  // Results: DB-only unless a draw is due, so a frequent tick costs no requests
  { name: 'draws-results', schedule: '*/5 * * * *', timezone: TIMEZONE, run: () => fetchDueResults() },
  // Expire unclaimed prizes and send the 7-day reminders
  { name: 'prize-claims', schedule: '0 9 * * *', timezone: TIMEZONE, run: () => runPrizeClaimJob() },
  // Subscriptions: 15:45 Israel time on draw days, 3 h before the earliest cutoff
  { name: 'subscriptions', schedule: '45 15 * * 2,4,6', timezone: TIMEZONE, run: () => runSubscriptionCron(), lockTtlMs: 5 * 60_000 },
];

const tasks: ScheduledTask[] = [];
const inFlight = new Set<Promise<JobOutcome>>();
let stopping = false;

/** Runs one job under its lock and logs the outcome. Exported for tests and manual runs. */
export async function runJob(job: JobDefinition, store: LockStore = redisLockStore(redis)): Promise<JobOutcome> {
  const outcome = await runWithJobLock(store, job.name, job.run, { ttlMs: job.lockTtlMs ?? 60_000 });
  const base = { job: job.name, outcome: outcome.status, durationMs: outcome.durationMs };
  switch (outcome.status) {
    case 'ran':
      logger.info({ ...base, result: outcome.result }, `job ${job.name} done`);
      break;
    case 'skipped_locked':
      logger.debug(base, `job ${job.name} skipped: running on another instance`);
      break;
    case 'skipped_lock_unavailable':
      logger.warn({ ...base, err: outcome.error }, `job ${job.name} skipped: lock store unavailable`);
      break;
    case 'failed':
      reportError(outcome.error, base);
      break;
  }
  return outcome;
}

// When Redis is briefly unreachable a tick is retried a few times rather than lost: for the daily
// jobs (subscriptions for a draw) a lost tick would otherwise wait a day or miss the draw.
const LOCK_RETRIES = 3;
const LOCK_RETRY_DELAY_MS = 20_000;

function trigger(job: JobDefinition, attempt = 0): void {
  if (stopping) return;
  const p = runJob(job).finally(() => inFlight.delete(p));
  inFlight.add(p);
  void p.then((outcome) => {
    if (outcome.status === 'skipped_lock_unavailable' && attempt < LOCK_RETRIES) {
      setTimeout(() => trigger(job, attempt + 1), LOCK_RETRY_DELAY_MS).unref();
    }
  });
}

export function startAllSchedulers(jobs: readonly JobDefinition[] = JOBS): void {
  stopping = false;
  for (const job of jobs) {
    tasks.push(cron.schedule(job.schedule, () => trigger(job), job.timezone ? { timezone: job.timezone } : {}));
    if (job.runOnStart) trigger(job);
  }
  logger.info({ jobs: jobs.map((j) => `${j.name} (${j.schedule})`) }, 'job schedulers started');
}

/** Stops new ticks and waits for running jobs (up to `timeoutMs`). */
export async function stopAllSchedulers(timeoutMs = 20_000): Promise<void> {
  stopping = true;
  for (const t of tasks.splice(0)) t.stop();
  if (inFlight.size === 0) return;
  logger.info({ running: inFlight.size }, 'waiting for running jobs to finish');
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    Promise.allSettled([...inFlight]),
    new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        logger.warn({ running: inFlight.size }, 'jobs still running at shutdown timeout');
        resolve();
      }, timeoutMs);
    }),
  ]);
  clearTimeout(timer);
}
