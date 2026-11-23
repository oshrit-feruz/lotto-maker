import { buildApp } from './server.js';
import { config } from './config.js';
import { prisma } from './prisma.js';
import { redis } from './redis.js';
import { startAllSchedulers, stopAllSchedulers } from './cron/index.js';
import { runStartupSeed } from './lib/startup-seed.js';
import { logger, processRole, routeConsoleToLogger } from './lib/logger.js';
import { initErrorReporting, reportError } from './lib/report-error.js';
import { onShutdownSignal, runShutdown } from './lib/shutdown.js';

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

if (config.RUN_API) await runStartupSeed();

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
