import { buildApp } from './server.js';
import { config } from './config.js';
import { prisma } from './prisma.js';
import { redis } from './redis.js';
import { startAllSchedulers, stopAllSchedulers } from './cron/index.js';
import { ensureDefaultSeedData } from './lib/startup-seed.js';
import { backfillIdEncryption } from './lib/backfill-id-encryption.js';
import { logger, processRole, routeConsoleToLogger } from './lib/logger.js';
import { initErrorReporting, reportError } from './lib/report-error.js';
import { onShutdownSignal, runShutdown } from './lib/shutdown.js';
import { redisLockStore, runWithJobLock } from './lib/job-lock.js';

// The modules log with console.*; in production that becomes structured, redacted JSON
if (config.NODE_ENV === 'production') routeConsoleToLogger();
await initErrorReporting();

process.on('unhandledRejection', (reason) => reportError(reason, { source: 'unhandledRejection' }));
process.on('uncaughtException', (err) => {
  reportError(err, { source: 'uncaughtException' });
  // State is unknown after an uncaught exception: exit and let the platform restart us
  process.exit(1);
});

const role = processRole();
if (role === 'none') {
  logger.fatal('RUN_API=false and RUN_JOBS=false: nothing to do');
  process.exit(1);
}
logger.info({ nodeEnv: config.NODE_ENV }, 'starting');

// The worker serves only /health and /ready, so the platform can health-check it
const app = await buildApp({ api: config.RUN_API });

if (config.RUN_API) {
  // Under the job lock, so API replicas starting together do not both create the default rows
  const seed = async () => {
    await ensureDefaultSeedData();
    // Encrypts any ID numbers still stored in plain text from before encryption existed
    await backfillIdEncryption().catch((err) => reportError(err, { source: 'backfill-id-encryption' }));
  };
  const outcome = await runWithJobLock(redisLockStore(redis), 'startup-seed', seed, { ttlMs: 5 * 60_000, minHoldMs: 0 });
  // Without Redis the seed still runs: it only creates rows that are missing
  if (outcome.status === 'skipped_lock_unavailable') await seed();
  else if (outcome.status === 'failed') reportError(outcome.error, { source: 'startup-seed' });
}

await app.listen({ port: config.PORT, host: '0.0.0.0' });
if (config.RUN_JOBS) startAllSchedulers();

onShutdownSignal(async () => {
  const clean = await runShutdown(
    [
      // Jobs first: they use the database and Redis, which close last
      { name: 'schedulers', run: () => stopAllSchedulers(Math.floor(config.SHUTDOWN_TIMEOUT_MS * 0.6)) },
      // Stops accepting connections and waits for in-flight requests
      { name: 'http', run: () => app.close() },
      // No BullMQ queues or workers exist yet; close them here if any are added
      { name: 'prisma', run: () => prisma.$disconnect() },
      { name: 'redis', run: () => redis.quit() },
    ],
    config.SHUTDOWN_TIMEOUT_MS,
    logger,
  );
  logger.flush();
  process.exit(clean ? 0 : 1);
}, logger);
