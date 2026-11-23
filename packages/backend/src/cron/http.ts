import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.js';
import type { JobOutcome } from '../lib/job-lock.js';
import { JOBS, runJob, type JobDefinition } from './index.js';

/**
 * GET /cron/:job runs one job from the JOBS table (src/cron/index.ts) once, under the same Redis
 * lock and logging as the in-process scheduler. For platforms without a long-running process:
 * Vercel Cron calls these paths on the schedules in vercel.json and sends
 * `Authorization: Bearer <CRON_SECRET>`. Any other scheduler can call them the same way.
 *
 * Without CRON_SECRET the routes answer 404, so nothing is exposed on a deploy that does not use them.
 */
export interface CronRoutesOptions {
  jobs?: readonly JobDefinition[];
  /** '' disables the routes; undefined uses config.CRON_SECRET. */
  secret?: string;
  run?: (job: JobDefinition) => Promise<JobOutcome>;
  /** Waits before each retry when the lock store is unreachable. */
  retryDelaysMs?: readonly number[];
}

// Vercel does not retry a failed cron call, so a brief Redis outage would otherwise cost the tick
// (a whole day for the daily jobs). A few short retries, far below the function's maxDuration.
export const LOCK_RETRY_DELAYS_MS: readonly number[] = [2_000, 5_000];

/** Runs the job; retries only while the lock store is unreachable (ran / failed / locked are final). */
export async function runWithLockRetries(
  run: () => Promise<JobOutcome>,
  delaysMs: readonly number[] = LOCK_RETRY_DELAYS_MS,
): Promise<JobOutcome> {
  let outcome = await run();
  for (const delay of delaysMs) {
    if (outcome.status !== 'skipped_lock_unavailable') break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    outcome = await run();
  }
  return outcome;
}

/** Constant-time check of an `Authorization: Bearer <secret>` header. */
export function hasCronSecret(header: string | undefined, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const STATUS: Record<JobOutcome['status'], number> = {
  ran: 200,
  skipped_locked: 200, // another instance is running this tick: nothing to do
  skipped_lock_unavailable: 503,
  failed: 500,
};

export default fp(async function cronRoutes(app: FastifyInstance, opts: CronRoutesOptions = {}) {
  const {
    jobs = JOBS,
    secret = config.CRON_SECRET,
    run = (job: JobDefinition) => runJob(job),
    retryDelaysMs = LOCK_RETRY_DELAYS_MS,
  } = opts;
  const byName = new Map(jobs.map((j) => [j.name, j]));

  app.get(
    '/cron/:job',
    { config: { rateLimit: false }, schema: { hide: true } },
    async (request: FastifyRequest<{ Params: { job: string } }>, reply) => {
      if (!secret) return reply.status(404).send({ error: 'NOT_FOUND' });
      if (!hasCronSecret(request.headers.authorization, secret)) {
        return reply.status(401).send({ error: 'UNAUTHORIZED' });
      }
      const job = byName.get(request.params.job);
      if (!job) return reply.status(404).send({ error: 'NOT_FOUND' });
      const outcome = await runWithLockRetries(() => run(job), retryDelaysMs);
      return reply.status(STATUS[outcome.status]).send({ job: job.name, outcome: outcome.status, durationMs: outcome.durationMs });
    },
  );
});
