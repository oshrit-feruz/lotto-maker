import type { IncomingMessage, ServerResponse } from 'node:http';
import { applyVercelEnv } from './lib/platform-env.js';

/**
 * Vercel Functions entry (api/index.js re-exports the handler). The same Fastify app as
 * src/main.ts, without listen(): Vercel hands each request to the handler, which passes it to
 * Fastify's server (https://fastify.dev/docs/latest/Guides/Serverless/#vercel).
 *
 * Differences from main.ts, all because a function has no long-running process:
 * - no node-cron schedulers: Vercel Cron calls GET /cron/:job (src/cron/http.ts);
 * - no SIGTERM handling: the platform freezes or stops the instance;
 * - the startup seed runs once per instance, on its first request.
 *
 * The env fix-ups (src/lib/platform-env.ts) must run before config.ts is evaluated, so everything
 * that reads the config is imported dynamically, below.
 */
applyVercelEnv(process.env);

type App = Awaited<ReturnType<typeof import('./server.js').buildApp>>;

let appPromise: Promise<App> | undefined;

async function createApp(): Promise<App> {
  const { config } = await import('./config.js');
  const { routeConsoleToLogger } = await import('./lib/logger.js');
  const { initErrorReporting } = await import('./lib/report-error.js');
  const { buildApp } = await import('./server.js');
  const { default: cronRoutes } = await import('./cron/http.js');
  const { runStartupSeed } = await import('./lib/startup-seed.js');

  if (config.NODE_ENV === 'production') routeConsoleToLogger();
  await initErrorReporting();

  const app = await buildApp({ api: true });
  await app.register(cronRoutes);
  await runStartupSeed();
  await app.ready();
  return app;
}

/** The app, built once per function instance and reused by every request it serves. */
export function getApp(): Promise<App> {
  appPromise ??= createApp().catch((err: unknown) => {
    // A failed start (database down on a cold start) is retried by the next request
    appPromise = undefined;
    throw err;
  });
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  app.server.emit('request', req, res);
}
